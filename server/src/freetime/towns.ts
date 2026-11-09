/** Starting points for planning: county towns and other large towns (approximate centres, WGS84). */
export interface Town {
  id: string;
  name: string;
  county: string;
  lat: number;
  lng: number;
}

const T = (name: string, county: string, lat: number, lng: number): Town => ({
  id: name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-"),
  name,
  county,
  lat,
  lng,
});

export const TOWNS: Town[] = [
  T("Dublin city centre", "Dublin", 53.3498, -6.2603),
  T("Dún Laoghaire", "Dublin", 53.2944, -6.1339),
  T("Swords", "Dublin", 53.4597, -6.2181),
  T("Tallaght", "Dublin", 53.2859, -6.3734),
  T("Howth", "Dublin", 53.3786, -6.0656),
  T("Cork", "Cork", 51.8985, -8.4756),
  T("Kinsale", "Cork", 51.7059, -8.5222),
  T("Clonakilty", "Cork", 51.6231, -8.8706),
  T("Mallow", "Cork", 52.1345, -8.6454),
  T("Cobh", "Cork", 51.8503, -8.2967),
  T("Galway", "Galway", 53.2707, -9.0568),
  T("Clifden", "Galway", 53.4891, -10.0189),
  T("Limerick", "Limerick", 52.6638, -8.6267),
  T("Waterford", "Waterford", 52.2593, -7.1101),
  T("Dungarvan", "Waterford", 52.0884, -7.6254),
  T("Kilkenny", "Kilkenny", 52.6541, -7.2448),
  T("Wexford", "Wexford", 52.3369, -6.4633),
  T("Wicklow", "Wicklow", 52.9808, -6.0446),
  T("Bray", "Wicklow", 53.2028, -6.0983),
  T("Killarney", "Kerry", 52.0599, -9.5044),
  T("Tralee", "Kerry", 52.2713, -9.6999),
  T("Dingle", "Kerry", 52.1408, -10.2689),
  T("Kenmare", "Kerry", 51.8801, -9.5835),
  T("Ennis", "Clare", 52.8436, -8.9864),
  T("Lahinch", "Clare", 52.9334, -9.3446),
  T("Westport", "Mayo", 53.8008, -9.5148),
  T("Castlebar", "Mayo", 53.8550, -9.2879),
  T("Sligo", "Sligo", 54.2766, -8.4761),
  T("Donegal", "Donegal", 54.6538, -8.1096),
  T("Letterkenny", "Donegal", 54.9558, -7.7342),
  T("Athlone", "Westmeath", 53.4239, -7.9407),
  T("Mullingar", "Westmeath", 53.5259, -7.3381),
  T("Tullamore", "Offaly", 53.2739, -7.4889),
  T("Portlaoise", "Laois", 53.0344, -7.2998),
  T("Carlow", "Carlow", 52.8408, -6.9261),
  T("Naas", "Kildare", 53.2159, -6.6669),
  T("Kildare", "Kildare", 53.1561, -6.9149),
  T("Navan", "Meath", 53.6528, -6.6814),
  T("Drogheda", "Louth", 53.7179, -6.3561),
  T("Dundalk", "Louth", 54.0090, -6.4049),
  T("Cavan", "Cavan", 53.9908, -7.3606),
  T("Monaghan", "Monaghan", 54.2492, -6.9683),
  T("Longford", "Longford", 53.7276, -7.7983),
  T("Roscommon", "Roscommon", 53.6333, -8.1833),
  T("Carrick-on-Shannon", "Leitrim", 53.9469, -8.0901),
  T("Nenagh", "Tipperary", 52.8619, -8.1967),
  T("Clonmel", "Tipperary", 52.3550, -7.7039),
  T("Cashel", "Tipperary", 52.5159, -7.8854),
];

export const townById = (id: string) => TOWNS.find((t) => t.id === id);
