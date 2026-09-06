export const normalizeSearchQuery = (str: string): string => {
  if (!str) return "";
  return String(str).toLowerCase().replace(/[^a-z0-9]/g, "");
};

export const matchesVehicleSearch = (
  vehicleNo: string,
  searchQuery: string
): boolean => {
  if (!searchQuery || !searchQuery.trim()) return true;
  if (!vehicleNo) return false;
  const q = normalizeSearchQuery(searchQuery);
  const normNo = normalizeSearchQuery(vehicleNo);

  return (
    normNo.includes(q) ||
    String(vehicleNo).toLowerCase().includes(searchQuery.toLowerCase().trim())
  );
};
