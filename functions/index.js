const { onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions/v2");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onObjectFinalized } = require("firebase-functions/v2/storage");
const admin = require('firebase-admin');
const nodemailer = require("nodemailer");
const crypto = require('crypto');



admin.initializeApp();

const transporter = nodemailer.createTransport({
    service: "yahoo",
    auth: {
        user: "reneegithinji@yahoo.com",
        pass: "hpnzhrwgtuiuoxca"
    }
});

// Generate a unique token
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Helper function to format readable date
function formatReadableDate(timestamp) {
    // Add 3 hours for Kenya time (UTC+3)
    const kenyaTimestamp = timestamp + (3 * 60 * 60 * 1000);
    const date = new Date(kenyaTimestamp);
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    const minuteStr = minutes < 10 ? '0' + minutes : minutes;

    const day = date.getUTCDate();
    const month = date.toLocaleString('default', { month: 'long', timeZone: 'UTC' });
    const year = date.getUTCFullYear();

    return `${hour12}:${minuteStr} ${ampm} on ${day} ${month} ${year}`;
}

// ==================== FUNCTION 1: CREATE USER DOCUMENT ====================
exports.createUserDocument = onCall(async (request) => {
    const { email, name, role, userId } = request.data;

    if (!email) {
        throw new Error("Email is required");
    }

    // Check if user already exists
    const userDoc = await admin.firestore().collection('users').doc(email).get();

    if (userDoc.exists) {
        return {
            success: true,
            message: "User already exists"
        };
    }

    // Create new user document with email as document ID
    await admin.firestore().collection('users').doc(email).set({
        email: email,
        name: name || "",
        role: role || "parent",
        emailVerified: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        userId: userId || ""
    });

    logger.info("New user document created for:", email);

    return {
        success: true,
        message: "User document created successfully"
    };
});

// ==================== FUNCTION 2: SEND VERIFICATION EMAIL ====================
exports.sendVerificationEmail = onCall(async (request) => {
    logger.info("Received request data:", request.data);

    const email = request.data.email;

    if (!email) {
        logger.error("No email provided");
        throw new Error("No email provided");
    }

    // Check if there's an existing token that was already used successfully
    const sanitizedEmail = email.replace(/\./g, '_');
    const existingTokenDoc = await admin.firestore().collection('verificationTokens').doc(sanitizedEmail).get();

    let token = null;
    let expiresAt = null;
    let expiresAtReadable = null;

    // If existing token is NOT used, generate a new token
    // If existing token IS used, keep the old token (do NOT generate new one)
    if (existingTokenDoc.exists && existingTokenDoc.data().used === true) {
        // Already verified - keep existing token, don't create new one
        const existingData = existingTokenDoc.data();
        token = existingData.token;
        expiresAt = existingData.expiresAtTimestamp;
        expiresAtReadable = existingData.expiresAtReadable;
        logger.info("✅ Using existing token for already verified email:", email);
    } else {
        // Generate new token for new or incomplete signups
        token = generateToken();
        expiresAt = Date.now() + 2 * 60 * 1000; // 2 minutes from now
        expiresAtReadable = formatReadableDate(expiresAt);

        const tokenData = {
            email: email,
            token: token,
            expiresAtReadable: expiresAtReadable,
            expiresAtTimestamp: expiresAt,
            used: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        logger.info("Storing new token with document ID (sanitized email):", sanitizedEmail);
        await admin.firestore().collection('verificationTokens').doc(sanitizedEmail).set(tokenData);
    }

    // ALWAYS send the email (whether new token or existing token)
    const webLink = `https://manjano-bus.web.app/verify.html?token=${token}&email=${encodeURIComponent(email)}`;

    logger.info("Generated verification link for:", email);
    logger.info("Token expires at:", expiresAtReadable);

    const logoUrl = "https://firebasestorage.googleapis.com/v0/b/manjano-bus.firebasestorage.app/o/App%20Assets%2Fic_logo.png?alt=media&token=96d7f4e2-2ac7-4731-887d-7d6bce42f552";

    const mailOptions = {
        from: "Manjano Bus App <reneegithinji@yahoo.com>",
        to: email,
        subject: "Verify your email - Manjano Bus App",
        html: `
            <div style="text-align: center; font-family: Arial, sans-serif;">
                <h2>Verify Your Email Address</h2>
                <p style="color: #666; margin-bottom: 20px;">This link will expire in <strong style="color: #800080;">2 minutes</strong></p>
                <a href="${webLink}" style="
                    background-color:#800080;
                    color:white;
                    padding:12px 24px;
                    text-decoration:none;
                    border-radius:5px;
                    display:inline-block;
                    font-size:16px;
                    margin:20px 0;
                ">Click to Verify Email</a>
                <p style="color: #999; font-size: 12px; margin-top: 20px;">
                    If you didn't request this, please ignore this email.
                </p>
                <div style="margin-top: 40px;">
                    <img src="${logoUrl}"
                         alt="Manjano Bus App"
                         style="width: 80px; height: auto; display: block; margin: 0 auto;"
                         onerror="this.style.display='none'">
                    <p style="color: #800080; font-size: 14px; margin-top: 8px;">Manjano Bus App</p>
                </div>
            </div>
        `,
        text: `
Verify Your Email Address - Manjano Bus App

This link will expire in 2 minutes.

Click the link below to verify your email:

${webLink}

If you didn't request this, please ignore this email.
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        logger.info("Email sent successfully to:", email);
        return { success: true, message: "Verification email sent. Valid for 2 minutes." };
    } catch (err) {
        logger.error("Email error:", err);
        throw new Error("Failed to send email: " + err.message);
    }
});

// ==================== FUNCTION 3: VERIFY EMAIL TOKEN ====================
exports.verifyEmail = onCall(async (request) => {
    const { token, email } = request.data;

    logger.info("=== VERIFY EMAIL CALLED ===");
    logger.info("Token received:", token);
    logger.info("Email received from URL:", email);

    if (!token && !email) {
        logger.error("No token or email provided");
        throw new Error("No verification token or email provided");
    }

    let userEmail = email;
    logger.info("userEmail variable after assignment:", userEmail);

    // If email was not in the URL, try to get it from the token document
    if (!userEmail && token) {
        logger.info("Email not in URL, checking token document...");
        const tokenDoc = await admin.firestore().collection('verificationTokens').doc(token).get();
        if (tokenDoc.exists) {
            userEmail = tokenDoc.data().email;
            logger.info("Email found from token document:", userEmail);
        }
    }

    if (!userEmail) {
        logger.error("Could not determine email");
        return {
            success: false,
            error: "no_email",
            message: "Unable to verify. Please request a new link."
        };
    }

    logger.info("Final userEmail being used for parents check:", userEmail);

    // STEP 1: ALWAYS check if user already exists in parents collection FIRST
    logger.info("Checking if email exists in parents collection...");
    const parentsRef = admin.firestore().collection('parents');
    const parentQuery = await parentsRef.where('email', '==', userEmail).get();

    logger.info("Parents query result size:", parentQuery.size);

    if (!parentQuery.empty) {
        // User already has an active account
        logger.info("✅ Email found in parents collection. Returning account_active");
        return {
            success: false,
            error: "account_active",
            email: userEmail,
            message: "Your account is already active. Taking you to sign in..."
        };
    }

    logger.info("Email NOT found in parents collection. User is new.");

    // STEP 2: User is new - now validate the token
    if (!token) {
        logger.error("No token provided for new user");
        return {
            success: false,
            error: "invalid",
            message: "Invalid verification link. Please request a new one."
        };
    }

    // Sanitize email to match document ID
    const sanitizedEmail = userEmail.replace(/\./g, '_');
    logger.info("Looking up token document with sanitized email:", sanitizedEmail);
    const tokenDoc = await admin.firestore().collection('verificationTokens').doc(sanitizedEmail).get();
    logger.info("Token document exists?", tokenDoc.exists);

    if (!tokenDoc.exists) {
        logger.error("Token does not exist in Firestore");
        return {
            success: false,
            error: "invalid",
            message: "Invalid verification link. Please request a new one."
        };
    }

    const tokenData = tokenDoc.data();

    // Verify the email in token matches the email from URL
    if (tokenData.email !== userEmail) {
        logger.error("Email mismatch between token and URL");
        return {
            success: false,
            error: "mismatch",
            message: "Verification link does not match email. Please request a new one."
        };
    }

    // Check if expired
    const now = Date.now();
    const expiryTimestamp = tokenData.expiresAtTimestamp;

    if (now > expiryTimestamp) {
        logger.info("Token expired. Returning expired error");
        const sanitizedEmailForDelete = userEmail.replace(/\./g, '_');
        await admin.firestore().collection('verificationTokens').doc(sanitizedEmailForDelete).delete();
        return {
            success: false,
            error: "expired",
            message: "Link expired, please go back to the app and request for another link."
        };
    }

    // Check if already used
    if (tokenData.used) {
        logger.info("Token already used. Returning used error");
        return {
            success: false,
            error: "used",
            message: "This link has already been used. Please request a new verification email."
        };
    }

    // Mark token as used
    logger.info("Token valid. Marking as used and completing verification...");
    const sanitizedEmailForUpdate = userEmail.replace(/\./g, '_');
    await admin.firestore().collection('verificationTokens').doc(sanitizedEmailForUpdate).update({
        used: true,
        verifiedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Update user's email verification status in users collection
    const usersRef = admin.firestore().collection('users');
    const userDoc = await usersRef.doc(userEmail).get();

    if (userDoc.exists) {
        await usersRef.doc(userEmail).update({
            emailVerified: true,
            verifiedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    logger.info("Verification completed successfully");
    return {
        success: true,
        email: userEmail,
        message: "Email verified successfully!"
    };
});

// ==================== FUNCTION 4: CLEAN UP EXPIRED TOKENS ====================

exports.cleanupExpiredTokens = onSchedule("every 60 minutes", async (event) => {
    const now = Date.now();

    const expiredTokens = await admin.firestore()
        .collection('verificationTokens')
        .where('expiresAtTimestamp', '<', now)
        .get();

    if (expiredTokens.empty) {
        logger.info("No expired tokens to clean up");
        return;
    }

    const batch = admin.firestore().batch();
    expiredTokens.docs.forEach(doc => {
        batch.delete(doc.ref);
    });

    await batch.commit();
    logger.info(`✅ Cleaned up ${expiredTokens.size} expired tokens`);
});

// ==================== FUNCTION 5: TEST REPORT - RUN NOW ====================
exports.testReportNow = onCall(async (request) => {
    const adminEmail = "reneegithinji@yahoo.com";

    try {
        const parentsSnapshot = await admin.firestore()
            .collection('parents')
            .where('emailVerified', '==', true)
            .get();

        const driversSnapshot = await admin.firestore()
            .collection('drivers')
            .where('emailVerified', '==', true)
            .get();

        let parentsList = "";
        parentsSnapshot.forEach(doc => {
            const data = doc.data();
            parentsList += `${data.parentName || "Unknown"} | ${data.email || "No email"} | ${data.mobileNumber || "No phone"} | ${data.schoolName || "No school"}\n`;
        });

        let driversList = "";
        driversSnapshot.forEach(doc => {
            const data = doc.data();
            driversList += `${data.name || "Unknown"} | ${data.email || "No email"} | ${data.mobileNumber || "No phone"} | ${data.schoolName || "No school"}\n`;
        });

        await transporter.sendMail({
            from: "Manjano Bus App <reneegithinji@yahoo.com>",
            to: adminEmail,
            subject: `📊 TEST REPORT - Verified Users (${parentsSnapshot.size + driversSnapshot.size} total)`,
            text: `
TEST REPORT - Manjano Bus App
Date: ${new Date().toLocaleDateString()}

✅ VERIFIED PARENTS: ${parentsSnapshot.size}
${parentsList || "None"}

✅ VERIFIED DRIVERS: ${driversSnapshot.size}
${driversList || "None"}

TOTAL VERIFIED USERS: ${parentsSnapshot.size + driversSnapshot.size}
            `
        });

        logger.info(`Test report sent to ${adminEmail}`);

        return {
            success: true,
            parents: parentsSnapshot.size,
            drivers: driversSnapshot.size,
            total: parentsSnapshot.size + driversSnapshot.size,
            message: "Test report sent to your email"
        };

    } catch (error) {
        logger.error("Failed to send test report:", error);
        throw new Error("Failed to send test report: " + error.message);
    }
});

// ==================== FUNCTION 6: ADD ACTIVE FIELD TO ALL PARENTS ====================
exports.addActiveFieldToAllParents = onCall(async (request) => {
    const parentsRef = admin.firestore().collection('parents');
    const snapshot = await parentsRef.get();

    let updatedCount = 0;
    const batch = admin.firestore().batch();

    snapshot.forEach(doc => {
        // Only add active field if it doesn't exist
        if (!doc.data().hasOwnProperty('active')) {
            batch.update(doc.ref, { active: true });
            updatedCount++;
        }
    });

    await batch.commit();
    logger.info(`✅ Added active:true to ${updatedCount} parent documents`);
    return { success: true, updatedCount: updatedCount };
});

// ==================== FUNCTION: ADD ACTIVE FIELD TO ALL DRIVERS ====================
exports.addActiveFieldToAllDrivers = onCall(async (request) => {
    const driversRef = admin.firestore().collection('drivers');
    const snapshot = await driversRef.get();

    let updatedCount = 0;
    const batch = admin.firestore().batch();

    snapshot.forEach(doc => {
        if (!doc.data().hasOwnProperty('active')) {
            batch.update(doc.ref, { active: true });
            updatedCount++;
        }
    });

    await batch.commit();
    logger.info(`✅ Added active:true to ${updatedCount} driver documents`);
    return { success: true, updatedCount: updatedCount };
});

// ==================== FUNCTION 7: SYNC PARENT ACTIVE STATUS - FIXED & ROBUST ====================
exports.syncParentActiveStatus = onDocumentUpdated(
    {
        document: "parents/{parentId}",
        region: "us-central1"
    },
    async (event) => {
        const beforeData = event.data.before.data();
        const afterData = event.data.after.data();

        const beforeActive = beforeData?.active;
        const afterActive = afterData?.active;
        const parentName = (afterData?.parentName || beforeData?.parentName || '').trim();

        if (beforeActive === afterActive) {
            return null;
        }

        logger.info(`[syncParentActiveStatus] Active changed: ${beforeActive} → ${afterActive} | Parent: ${parentName}`);

        const db = admin.database();
        const firestore = admin.firestore();

       // Find stable parentKey by scanning which node owns the children — never derive from name.
               const childrenNamesForScan = [];
               if (afterData?.childName) childrenNamesForScan.push(afterData.childName.trim());
               for (let i = 1; i <= 10; i++) {
                   if (afterData?.[`childName${i}`]) childrenNamesForScan.push(afterData[`childName${i}`].trim());
               }
               const childKeysForScan = childrenNamesForScan.map(n => n.toLowerCase().replace(/[^a-z0-9]/g, '_'));

               let parentKey = parentName.toLowerCase().replace(/[^a-z0-9]/g, '_');
               const parentsSnap = await db.ref('parents').once('value');
               parentsSnap.forEach(node => {
                   const key = node.key;
                   if (key === '_displayName') return;
                   const children = node.child('children').val() || {};
                   if (childKeysForScan.some(ck => !!children[ck])) {
                       parentKey = key;
                   }
               });

               logger.info(`[syncParentActiveStatus] Using parentKey: ${parentKey}`);
        // Get children names
        const childrenNames = [];
        if (afterData?.childName) childrenNames.push(afterData.childName.trim());
        for (let i = 1; i <= 10; i++) {
            if (afterData?.[`childName${i}`]) childrenNames.push(afterData[`childName${i}`].trim());
        }

        if (afterActive === true) {
            // Reactivating
            logger.info(`[syncParentActiveStatus] Reactivating ${parentName}`);

            for (const name of childrenNames) {
                const childKey = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
                const studentRef = db.ref(`students/${childKey}`);

                const cSnap = await firestore.collection('children')
                    .where('childName', '==', name)
                    .where('parentName', '==', parentName)
                    .limit(1).get();

                let childData = !cSnap.empty ? cSnap.docs[0].data() : {};

                const finalData = {
                    active: true,
                    childId: childKey,
                    displayName: name,
                    parentName: parentName,
                    status: childData.status || 'On Route',
                    eta: childData.eta || 'Arriving in 5 minutes',
                    photoUrl: childData.photoUrl || ''
                };

                await studentRef.update(finalData);
                await db.ref(`parents/${parentKey}/children/${childKey}`).update(finalData);
            }

            await db.ref(`parents/${parentKey}/active`).set(true);
            await db.ref(`parents/${parentKey}/forcedLogout`).remove();

        } else {
            // === DEACTIVATE ===
            logger.info(`[syncParentActiveStatus] Deactivating parent: ${parentName}`);

            for (const name of childrenNames) {
                const childKey = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
                await db.ref(`students/${childKey}`).remove().catch(() => {});
                await db.ref(`parents/${parentKey}/children/${childKey}`).remove().catch(() => {});
            }

            // Force logout + set active false
            await db.ref(`parents/${parentKey}/active`).set(false);
            await db.ref(`parents/${parentKey}/forcedLogout`).set(true);

            logger.info(`[syncParentActiveStatus] ✅ Deactivated + forcedLogout flag set for ${parentKey}`);
        }

        return null;
    }
);



// ==================== FUNCTION 8: SYNC NEW PARENT (SKELETON WITH MERGE) ====================
exports.syncNewParent = onDocumentCreated(
    {
        document: "parents/{parentId}",
        region: "us-central1",
        timeoutSeconds: 540,
        memory: "512Mi"
    },
    async (event) => {
        const data = event.data.data();
        const parentName = data.parentName || '';

        if (data.active === false) return null;

        const childrenNames = [];
        if (data.childName && data.childName.trim() !== '') childrenNames.push(data.childName.trim());
        for (let i = 1; i <= 10; i++) {
            const name = data[`childName${i}`];
            if (name && name.trim() !== '') childrenNames.push(name.trim());
        }

        if (childrenNames.length === 0) return null;

        const db = admin.database();
        const firestore = admin.firestore();
        const parentKey = parentName.toLowerCase().replace(/[^a-z0-9]/g, '_');

        const isValid = (val) => val !== undefined && val !== null && val !== "" && val !== 0;

        for (const childName of childrenNames) {
            const childKey = childName.toLowerCase().replace(/[^a-z0-9]/g, '_');

            const studentRef = db.ref(`students/${childKey}`);
            const existingSnap = await studentRef.once('value');
            const existing = existingSnap.exists() ? existingSnap.val() : {};

            const cSnap = await firestore.collection('children')
                .where('childName', '==', childName)
                .where('parentName', '==', parentName)
                .limit(1).get();

            let firestoreChildData = {};
            if (!cSnap.empty) {
                firestoreChildData = cSnap.docs[0].data();
            }

            const mergedData = {
                ...existing,
                active: true,
                childId: childKey,
                displayName: childName,
                parentName: parentName,
                eta: existing.eta || 'Arriving in 5 minutes',
                photoUrl: existing.photoUrl || '',
                status: existing.status || 'On Route',

                pickUpAddress: isValid(firestoreChildData.pickUpAddress) ? firestoreChildData.pickUpAddress : (existing.pickUpAddress || ''),
                pickUpLat: isValid(firestoreChildData.pickUpLat) ? firestoreChildData.pickUpLat : (existing.pickUpLat || 0),
                pickUpLng: isValid(firestoreChildData.pickUpLng) ? firestoreChildData.pickUpLng : (existing.pickUpLng || 0),
                pickUpPlaceId: isValid(firestoreChildData.pickUpPlaceId) ? firestoreChildData.pickUpPlaceId : (existing.pickUpPlaceId || ''),

                dropOffAddress: isValid(firestoreChildData.dropOffAddress) ? firestoreChildData.dropOffAddress : (existing.dropOffAddress || ''),
                dropOffLat: isValid(firestoreChildData.dropOffLat) ? firestoreChildData.dropOffLat : (existing.dropOffLat || 0),
                dropOffLng: isValid(firestoreChildData.dropOffLng) ? firestoreChildData.dropOffLng : (existing.dropOffLng || 0),
                dropOffPlaceId: isValid(firestoreChildData.dropOffPlaceId) ? firestoreChildData.dropOffPlaceId : (existing.dropOffPlaceId || ''),
            };

            await studentRef.update(mergedData);
            await db.ref(`parents/${parentKey}/children/${childKey}`).update(mergedData);
        }

        await db.ref(`parents/${parentKey}/active`).set(true);
        return null;
    }
);

// ==================== FUNCTION 9: CHILD NAME CHANGE - FULL SYNC ====================
exports.syncChildUpdate = onDocumentUpdated(
    {
        document: "children/{childId}",
        region: "us-central1",
        timeoutSeconds: 300,
        memory: "512Mi"
    },
    async (event) => {
        const beforeData = event.data.before.data();
        const afterData = event.data.after.data();
        if (!afterData) return null;

        const beforeChildName = (beforeData?.childName || '').trim();
        const afterChildName  = (afterData.childName || '').trim();
        const parentName      = (afterData.parentName || beforeData?.parentName || '').trim();

        if (!afterChildName || !parentName) {
            logger.warn("[syncChildUpdate] Missing childName or parentName");
            return null;
        }

        const db = admin.database();
        const firestore = admin.firestore();

        const oldChildKey = beforeChildName ? beforeChildName.toLowerCase().replace(/[^a-z0-9]/g, '_') : null;
        const newChildKey = afterChildName.toLowerCase().replace(/[^a-z0-9]/g, '_');

        const nameChanged = beforeChildName && beforeChildName !== afterChildName;

        logger.info(`[syncChildUpdate] "${beforeChildName}" → "${afterChildName}" | Name changed: ${nameChanged} | Parent: ${parentName}`);

        // Find stable parentKey
        let parentKey = parentName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const parentsSnap = await db.ref('parents').once('value');

        parentsSnap.forEach(node => {
            const key = node.key;
            if (key === '_displayName') return;
            const childrenData = node.child('children').val() || {};
            if ((oldChildKey && childrenData[oldChildKey]) || childrenData[newChildKey]) {
                parentKey = key;
            }
        });

        logger.info(`[syncChildUpdate] Using parentKey: ${parentKey}`);

        const studentRef = db.ref(`students/${newChildKey}`);
        const parentChildRef = db.ref(`parents/${parentKey}/children/${newChildKey}`);

        // Prepare full data
        const existingSnap = await db.ref(`students/${oldChildKey || newChildKey}`).once('value');
        const existing = existingSnap.exists() ? existingSnap.val() : {};

        const isValid = (val) => val !== undefined && val !== null && val !== "" && val !== 0;

        const resolve = (after, before, exist, def) =>
            isValid(after) ? after : isValid(before) ? before : (isValid(exist) ? exist : def);

        const rtdbData = {
            ...existing,
            active: true,
            childId: newChildKey,
            displayName: afterChildName,
            parentName: parentName,
            photoUrl: resolve(afterData.photoUrl, beforeData?.photoUrl, existing.photoUrl, ''),
            status: resolve(afterData.status, beforeData?.status, existing.status, 'On Route'),
            eta: resolve(afterData.eta, beforeData?.eta, existing.eta, 'Arriving in 5 minutes'),
            lastSync: admin.database.ServerValue.TIMESTAMP
        };

        // Location fields
        ['pickUpAddress','pickUpLat','pickUpLng','pickUpPlaceId',
         'dropOffAddress','dropOffLat','dropOffLng','dropOffPlaceId'].forEach(field => {
            const val = resolve(afterData[field], beforeData?.[field], existing[field], null);
            if (val !== null) rtdbData[field] = val;
        });

        // ====================== RTDB WRITE ======================
        if (nameChanged && oldChildKey) {
            logger.info(`[syncChildUpdate] Migrating child: ${oldChildKey} → ${newChildKey}`);

            // Write to new locations
            await studentRef.set(rtdbData);
            await parentChildRef.set(rtdbData);   // ← This is the important one for parent dashboard

            // Remove old locations
            await db.ref(`students/${oldChildKey}`).remove().catch(() => {});
            await db.ref(`parents/${parentKey}/children/${oldChildKey}`).remove().catch(() => {});
        } else {
            await studentRef.update(rtdbData);
            await parentChildRef.update(rtdbData);
        }

        logger.info(`[syncChildUpdate] ✅ RTDB sync done (students + parents/children)`);

        // ====================== Update parents collection ======================
        if (nameChanged) {
            logger.info(`[syncChildUpdate] Updating parents collection childName fields...`);

            const parentQuery = await firestore.collection('parents')
                .where('parentName', '==', parentName)
                .limit(1)
                .get();

            if (!parentQuery.empty) {
                const parentDoc = parentQuery.docs[0];
                const parentData = parentDoc.data();
                const batch = firestore.batch();
                let updated = false;

                if (parentData.childName === beforeChildName) {
                    batch.update(parentDoc.ref, { childName: afterChildName });
                    updated = true;
                }

                for (let i = 1; i <= 10; i++) {
                    const field = `childName${i}`;
                    if (parentData[field] === beforeChildName) {
                        batch.update(parentDoc.ref, { [field]: afterChildName });
                        updated = true;
                    }
                }

                if (updated) {
                    await batch.commit();
                    logger.info(`[syncChildUpdate] ✅ Updated childName in parents collection`);
                }
            }
        }

        logger.info(`[syncChildUpdate] ✅ Complete - child "${afterChildName}" fully synced`);
        return null;
    }
);


// ==================== FUNCTION 10: SYNC CHILD LOCATIONS ON CREATE ====================
exports.syncChildLocationsOnCreate = onDocumentCreated(
    {
        document: "children/{childId}",
        region: "us-central1",
        timeoutSeconds: 540,
        memory: "512Mi"
    },
    async (event) => {
        const afterData = event.data.data();
        if (!afterData) return null;

        const childName = afterData.childName;
        const parentName = afterData.parentName;

        if (!childName || !parentName) {
            logger.info("Child or parent name missing, skipping");
            return null;
        }

        // STRICT VALIDATION - require ALL location fields
        const hasPickupAddress = afterData.pickUpAddress && afterData.pickUpAddress.trim() !== '';
        const hasPickupLat = typeof afterData.pickUpLat === 'number' && afterData.pickUpLat !== 0;
        const hasPickupLng = typeof afterData.pickUpLng === 'number' && afterData.pickUpLng !== 0;
        const hasPickupPlaceId = afterData.pickUpPlaceId && afterData.pickUpPlaceId.trim() !== '';

        const hasDropoffAddress = afterData.dropOffAddress && afterData.dropOffAddress.trim() !== '';
        const hasDropoffLat = typeof afterData.dropOffLat === 'number' && afterData.dropOffLat !== 0;
        const hasDropoffLng = typeof afterData.dropOffLng === 'number' && afterData.dropOffLng !== 0;
        const hasDropoffPlaceId = afterData.dropOffPlaceId && afterData.dropOffPlaceId.trim() !== '';

        const isComplete = hasPickupAddress && hasPickupLat && hasPickupLng && hasPickupPlaceId &&
                          hasDropoffAddress && hasDropoffLat && hasDropoffLng && hasDropoffPlaceId;

        if (!isComplete) {
            logger.info(`⏳ Child ${childName} created without complete location data. Will wait for update.`);
            return null;
        }

        logger.info(`📍 Complete location data on CREATE for ${childName}. Merging to RTDB...`);

       const db = admin.database();
               const childKey = childName.toLowerCase().replace(/[^a-z0-9]/g, '_');

               let parentKey = null;
               const parentsSnap = await db.ref('parents').once('value');
               parentsSnap.forEach(node => {
                   const key = node.key;
                   if (key === '_displayName') return;
                   const children = node.child('children').val() || {};
                   if (children[childKey]) {
                       parentKey = key;
                   }
               });

               if (!parentKey) {
                   logger.warn(`[syncChildLocationsOnCreate] Could not find RTDB parent node for child ${childKey}. Skipping.`);
                   return null;
               }

               logger.info(`[syncChildLocationsOnCreate] Using stable parentKey: ${parentKey}`);

               const locationData = {
                   pickUpAddress: afterData.pickUpAddress,
                   pickUpPlaceId: afterData.pickUpPlaceId,
                   pickUpLat: afterData.pickUpLat,
                   pickUpLng: afterData.pickUpLng,
                   dropOffAddress: afterData.dropOffAddress,
                   dropOffPlaceId: afterData.dropOffPlaceId,
                   dropOffLat: afterData.dropOffLat,
                   dropOffLng: afterData.dropOffLng,
                   lastLocationSync: admin.database.ServerValue.TIMESTAMP
               };

               await db.ref(`students/${childKey}`).update(locationData);
               await db.ref(`parents/${parentKey}/children/${childKey}`).update(locationData);

               logger.info(`✅ Location fields merged on CREATE for ${childName}`);
               logger.info(`   pickUpAddress: ${afterData.pickUpAddress}`);
               logger.info(`   dropOffAddress: ${afterData.dropOffAddress}`);

               return null;
    }
);

// ==================== FUNCTION 11: SYNC CHILD LOCATIONS ON UPDATE (WITH COMPLETE CHANGE DETECTION) ====================
exports.syncChildLocationsOnUpdate = onDocumentUpdated(
    {
        document: "children/{childId}",
        region: "us-central1",
        timeoutSeconds: 540,
        memory: "512Mi"
    },
    async (event) => {
        const afterData = event.data.after.data();
        if (!afterData) return null;

        const beforeData = event.data.before.data();
        const childName = afterData.childName;
        const parentName = afterData.parentName;

        if (!childName || !parentName) {
            logger.info("Child or parent name missing, skipping");
            return null;
        }

        // Skip if only parentName changed and nothing else — that is handled by syncParentNameChange.
        // This prevents a ghost node being created from the stale parentName-derived key.
        const beforeParentName = (beforeData?.parentName || '').trim();
        const afterParentName = (afterData?.parentName || '').trim();
        const onlyParentNameChanged = beforeParentName !== afterParentName &&
            beforeData?.pickUpAddress === afterData.pickUpAddress &&
            beforeData?.pickUpPlaceId === afterData.pickUpPlaceId &&
            beforeData?.pickUpLat === afterData.pickUpLat &&
            beforeData?.pickUpLng === afterData.pickUpLng &&
            beforeData?.dropOffAddress === afterData.dropOffAddress &&
            beforeData?.dropOffPlaceId === afterData.dropOffPlaceId &&
            beforeData?.dropOffLat === afterData.dropOffLat &&
            beforeData?.dropOffLng === afterData.dropOffLng;

        if (onlyParentNameChanged) {
            logger.info(`⏭️ Only parentName changed for ${childName}, skipping location sync.`);
            return null;
        }

        const beforePickupAddress = beforeData ? beforeData.pickUpAddress : null;
        const beforePickupPlaceId = beforeData ? beforeData.pickUpPlaceId : null;
        const beforePickupLat = beforeData ? beforeData.pickUpLat : null;
        const beforePickupLng = beforeData ? beforeData.pickUpLng : null;
        const beforeDropoffAddress = beforeData ? beforeData.dropOffAddress : null;
        const beforeDropoffPlaceId = beforeData ? beforeData.dropOffPlaceId : null;
        const beforeDropoffLat = beforeData ? beforeData.dropOffLat : null;
        const beforeDropoffLng = beforeData ? beforeData.dropOffLng : null;

        const locationChanged = (beforePickupAddress !== afterData.pickUpAddress) ||
                                (beforePickupPlaceId !== afterData.pickUpPlaceId) ||
                                (beforePickupLat !== afterData.pickUpLat) ||
                                (beforePickupLng !== afterData.pickUpLng) ||
                                (beforeDropoffAddress !== afterData.dropOffAddress) ||
                                (beforeDropoffPlaceId !== afterData.dropOffPlaceId) ||
                                (beforeDropoffLat !== afterData.dropOffLat) ||
                                (beforeDropoffLng !== afterData.dropOffLng);

        if (!locationChanged) {
            logger.info(`⏭️ No location field changes detected for ${childName}, skipping update.`);
            return null;
        }

        logger.info(`📍 Location change detected for ${childName}. Validating data...`);

        const hasPickupAddress = afterData.pickUpAddress && afterData.pickUpAddress.trim() !== '';
        const hasPickupLat = typeof afterData.pickUpLat === 'number' && afterData.pickUpLat !== 0;
        const hasPickupLng = typeof afterData.pickUpLng === 'number' && afterData.pickUpLng !== 0;
        const hasPickupPlaceId = afterData.pickUpPlaceId && afterData.pickUpPlaceId.trim() !== '';
        const hasDropoffAddress = afterData.dropOffAddress && afterData.dropOffAddress.trim() !== '';
        const hasDropoffLat = typeof afterData.dropOffLat === 'number' && afterData.dropOffLat !== 0;
        const hasDropoffLng = typeof afterData.dropOffLng === 'number' && afterData.dropOffLng !== 0;
        const hasDropoffPlaceId = afterData.dropOffPlaceId && afterData.dropOffPlaceId.trim() !== '';

        const isComplete = hasPickupAddress && hasPickupLat && hasPickupLng && hasPickupPlaceId &&
                          hasDropoffAddress && hasDropoffLat && hasDropoffLng && hasDropoffPlaceId;

        if (!isComplete) {
            logger.warn(`⚠️ Incomplete location data for ${childName}, skipping write.`);
            return null;
        }

        logger.info(`📍 Complete location data on UPDATE for ${childName}. Merging to RTDB...`);

                const db = admin.database();
                const childKey = childName.toLowerCase().replace(/[^a-z0-9]/g, '_');

                let parentKey = null;
                const parentsSnap = await db.ref('parents').once('value');
                parentsSnap.forEach(node => {
                    const key = node.key;
                    if (key === '_displayName') return;
                    const children = node.child('children').val() || {};
                    if (children[childKey]) {
                        parentKey = key;
                    }
                });

                if (!parentKey) {
                    logger.warn(`[syncChildLocationsOnUpdate] Could not find RTDB parent node for child ${childKey}. Skipping.`);
                    return null;
                }

                logger.info(`[syncChildLocationsOnUpdate] Using stable parentKey: ${parentKey}`);

                const locationData = {
                    pickUpAddress: afterData.pickUpAddress,
                    pickUpPlaceId: afterData.pickUpPlaceId,
                    pickUpLat: afterData.pickUpLat,
                    pickUpLng: afterData.pickUpLng,
                    dropOffAddress: afterData.dropOffAddress,
                    dropOffPlaceId: afterData.dropOffPlaceId,
                    dropOffLat: afterData.dropOffLat,
                    dropOffLng: afterData.dropOffLng,
                    lastLocationSync: admin.database.ServerValue.TIMESTAMP
                };

                await db.ref(`students/${childKey}`).update(locationData);
                await db.ref(`parents/${parentKey}/children/${childKey}`).update(locationData);

                logger.info(`✅ Location fields merged on UPDATE for ${childName}`);
                logger.info(`   pickUpAddress: ${afterData.pickUpAddress}`);
                logger.info(`   dropOffAddress: ${afterData.dropOffAddress}`);

                return null;
            }
        );


// ==================== FUNCTION 12: SYNC PARENT NAME CHANGE ====================
exports.syncParentNameChange = onDocumentUpdated(
    {
        document: "parents/{parentId}",
        region: "us-central1",
        timeoutSeconds: 300,
        memory: "512Mi"
    },
    async (event) => {
        const beforeData = event.data.before.data();
        const afterData = event.data.after.data();

        const beforeParentName = (beforeData?.parentName || '').trim();
        const afterParentName = (afterData?.parentName || '').trim();

        if (beforeParentName === afterParentName || !afterParentName) {
            return null;
        }

        logger.info(`[syncParentNameChange] "${beforeParentName}" → "${afterParentName}"`);

        const db = admin.database();
        const firestore = admin.firestore();

        const childrenNames = [];
        if (afterData.childName) childrenNames.push(afterData.childName.trim());
        for (let i = 1; i <= 10; i++) {
            const n = afterData[`childName${i}`];
            if (n && n.trim()) childrenNames.push(n.trim());
        }

        if (childrenNames.length === 0) return null;

        // Find stable RTDB parentKey by scanning which node owns these children.
        // Never derive from parentName — that causes ghost nodes.
        const childKeys = childrenNames.map(n => n.toLowerCase().replace(/[^a-z0-9]/g, '_'));
        let parentKey = null;
        const parentsSnap = await db.ref('parents').once('value');
        parentsSnap.forEach(node => {
            const key = node.key;
            if (key === '_displayName') return;
            const children = node.child('children').val() || {};
            if (childKeys.some(ck => !!children[ck])) {
                parentKey = key;
            }
        });

        if (!parentKey) {
            logger.warn(`[syncParentNameChange] Could not find RTDB parent node. Skipping RTDB update.`);
        } else {
            // Update _displayName and parentName inside each child — in place, no node rename.
            await db.ref(`parents/${parentKey}/_displayName`).set(afterParentName);
            for (const childName of childrenNames) {
                const childKey = childName.toLowerCase().replace(/[^a-z0-9]/g, '_');
                await db.ref(`parents/${parentKey}/children/${childKey}/parentName`).set(afterParentName).catch(() => {});
                await db.ref(`students/${childKey}/parentName`).set(afterParentName).catch(() => {});
            }
            logger.info(`[syncParentNameChange] ✅ RTDB _displayName and child parentName fields updated for key: ${parentKey}`);
        }

        // Update children collection in Firestore
        const snap1 = await firestore.collection('children')
            .where('parentName', '==', beforeParentName)
            .get();

        const snap2Promises = childrenNames.map(name =>
            firestore.collection('children').where('childName', '==', name).get()
        );
        const snap2Results = await Promise.all(snap2Promises);
        const snap2 = snap2Results.flatMap(s => s.docs);

        const allDocs = [...snap1.docs, ...snap2];
        const uniqueDocs = new Map();
        allDocs.forEach(doc => uniqueDocs.set(doc.id, doc));

        if (uniqueDocs.size > 0) {
            const batch = firestore.batch();
            let updateCount = 0;
            uniqueDocs.forEach(doc => {
                if (doc.data().parentName !== afterParentName) {
                    batch.update(doc.ref, { parentName: afterParentName });
                    updateCount++;
                }
            });
            if (updateCount > 0) {
                await batch.commit();
                logger.info(`[syncParentNameChange] ✅ Updated ${updateCount} children in Firestore`);
            }
        }

        logger.info(`[syncParentNameChange] ✅ Complete`);
        return null;
    }
);

// ==================== FUNCTION 13: SEND BUS PUSH NOTIFICATION ====================
// This is a standalone function for the Driver App to alert Parents.
// It does not interact with the child synchronization or email logic.
exports.sendBusNotification = onCall({
    region: "us-central1",
    memory: "256Mi"
}, async (request) => {
    // request.data is used in Firebase Functions v2
    const { token, childName } = request.data;

    if (!token) {
        logger.error("[sendBusNotification] No FCM token provided by driver app");
        return { success: false, error: "Missing device token" };
    }

    const message = {
        token: token,
        notification: {
            title: "Manjano Bus Update",
            body: `We are approaching. ${childName || 'Your student'} should be at the stop in 2 minutes.`
        },
        android: {
            priority: "high",
            notification: {
                sound: "default",
                channelId: "bus_updates",
                clickAction: "FLUTTER_NOTIFICATION_CLICK"
            }
        }
    };

    try {
        const response = await admin.messaging().send(message);
        logger.info(`[sendBusNotification] Push sent successfully for student: ${childName}`);
        return { success: true, messageId: response };
    } catch (error) {
        logger.error("[sendBusNotification] FCM Send Error:", error);
        return { success: false, error: error.message };
    }
});