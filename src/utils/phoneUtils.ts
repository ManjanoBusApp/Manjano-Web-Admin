import { parsePhoneNumberFromString, getCountries } from "libphonenumber-js";

// Format number for display (UI only)
export const formatPhoneDisplay = (value: string) => {
  if (!value) return "";

  const phone = parsePhoneNumberFromString(value);

  if (!phone) return value;

  return phone.formatInternational();
};

// Validate full number (login + admin enforcement)
export const isValidPhone = (value: string) => {
  const phone = parsePhoneNumberFromString(value);

  if (!phone) return false;

  return phone.isValid();
};

// Extract country from number
export const getCountryFromPhone = (value: string) => {
  const phone = parsePhoneNumberFromString(value);

  if (!phone) return null;

  return phone.country; // ISO code (KE, GB, AE)
};

// Get dial code
export const getDialCode = (countryCode: string) => {
  const phone = parsePhoneNumberFromString("+" + countryCode);

  return phone ? phone.countryCallingCode : "";
};

// Get all countries (for dropdown)
export const getAllCountries = () => {
  return getCountries().map((c) => ({
    code: c,
  }));
};