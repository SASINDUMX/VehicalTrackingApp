export const normalizeSearchQuery = (str: string): string => {
  if (!str) return "";
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
};

export const matchesVehicleSearch = (
  vehicleNo: string,
  model: string,
  searchQuery: string
): boolean => {
  if (!searchQuery || !searchQuery.trim()) return true;
  const q = normalizeSearchQuery(searchQuery);
  const normNo = normalizeSearchQuery(vehicleNo);
  const normModel = normalizeSearchQuery(model);

  return (
    normNo.includes(q) ||
    normModel.includes(q) ||
    vehicleNo.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );
};
