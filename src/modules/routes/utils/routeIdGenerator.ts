export function generateRouteId(
    schoolId: string,
    routeName: string
  ): string {
    const clean = (value: string) =>
      value
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, "")
        .replace(/\s+/g, "_");
  
    const school = clean(schoolId);
    const route = clean(routeName);
  
    return `${school}_${route}`;
  }