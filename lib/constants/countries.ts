/**
 * ISO 3166-1 alpha-2 country reference data.
 *
 * Generated from ICU region display names, so spellings match what browsers
 * and operating systems show. Flag emoji are derived from the country code
 * (regional indicator pairs) rather than stored as images.
 *
 * `dial` is present for the countries VisaDrive realistically serves; it is
 * optional because an absent dial code should not hide a country from a
 * nationality dropdown.
 */

export interface Country {
  code: string;
  name: string;
  flag: string;
  dial?: string;
}

export const COUNTRIES: Country[] = [
  { code: "AD", name: "Andorra", flag: "🇦🇩" },
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪", dial: "+971" },
  { code: "AF", name: "Afghanistan", flag: "🇦🇫", dial: "+93" },
  { code: "AG", name: "Antigua & Barbuda", flag: "🇦🇬" },
  { code: "AI", name: "Anguilla", flag: "🇦🇮" },
  { code: "AL", name: "Albania", flag: "🇦🇱", dial: "+355" },
  { code: "AM", name: "Armenia", flag: "🇦🇲", dial: "+374" },
  { code: "AO", name: "Angola", flag: "🇦🇴", dial: "+244" },
  { code: "AR", name: "Argentina", flag: "🇦🇷", dial: "+54" },
  { code: "AT", name: "Austria", flag: "🇦🇹", dial: "+43" },
  { code: "AU", name: "Australia", flag: "🇦🇺", dial: "+61" },
  { code: "AW", name: "Aruba", flag: "🇦🇼" },
  { code: "AZ", name: "Azerbaijan", flag: "🇦🇿", dial: "+994" },
  { code: "BA", name: "Bosnia & Herzegovina", flag: "🇧🇦", dial: "+387" },
  { code: "BB", name: "Barbados", flag: "🇧🇧" },
  { code: "BD", name: "Bangladesh", flag: "🇧🇩", dial: "+880" },
  { code: "BE", name: "Belgium", flag: "🇧🇪", dial: "+32" },
  { code: "BF", name: "Burkina Faso", flag: "🇧🇫" },
  { code: "BG", name: "Bulgaria", flag: "🇧🇬", dial: "+359" },
  { code: "BH", name: "Bahrain", flag: "🇧🇭", dial: "+973" },
  { code: "BI", name: "Burundi", flag: "🇧🇮" },
  { code: "BJ", name: "Benin", flag: "🇧🇯" },
  { code: "BM", name: "Bermuda", flag: "🇧🇲" },
  { code: "BN", name: "Brunei", flag: "🇧🇳", dial: "+673" },
  { code: "BO", name: "Bolivia", flag: "🇧🇴" },
  { code: "BR", name: "Brazil", flag: "🇧🇷", dial: "+55" },
  { code: "BS", name: "Bahamas", flag: "🇧🇸" },
  { code: "BT", name: "Bhutan", flag: "🇧🇹", dial: "+975" },
  { code: "BW", name: "Botswana", flag: "🇧🇼", dial: "+267" },
  { code: "BY", name: "Belarus", flag: "🇧🇾", dial: "+375" },
  { code: "BZ", name: "Belize", flag: "🇧🇿" },
  { code: "CA", name: "Canada", flag: "🇨🇦", dial: "+1" },
  { code: "CD", name: "Congo - Kinshasa", flag: "🇨🇩" },
  { code: "CF", name: "Central African Republic", flag: "🇨🇫" },
  { code: "CG", name: "Congo - Brazzaville", flag: "🇨🇬" },
  { code: "CH", name: "Switzerland", flag: "🇨🇭", dial: "+41" },
  { code: "CI", name: "Côte d’Ivoire", flag: "🇨🇮" },
  { code: "CL", name: "Chile", flag: "🇨🇱", dial: "+56" },
  { code: "CM", name: "Cameroon", flag: "🇨🇲" },
  { code: "CN", name: "China", flag: "🇨🇳", dial: "+86" },
  { code: "CO", name: "Colombia", flag: "🇨🇴", dial: "+57" },
  { code: "CR", name: "Costa Rica", flag: "🇨🇷", dial: "+506" },
  { code: "CU", name: "Cuba", flag: "🇨🇺" },
  { code: "CV", name: "Cape Verde", flag: "🇨🇻" },
  { code: "CY", name: "Cyprus", flag: "🇨🇾", dial: "+357" },
  { code: "CZ", name: "Czechia", flag: "🇨🇿", dial: "+420" },
  { code: "DE", name: "Germany", flag: "🇩🇪", dial: "+49" },
  { code: "DJ", name: "Djibouti", flag: "🇩🇯" },
  { code: "DK", name: "Denmark", flag: "🇩🇰", dial: "+45" },
  { code: "DM", name: "Dominica", flag: "🇩🇲" },
  { code: "DO", name: "Dominican Republic", flag: "🇩🇴" },
  { code: "DZ", name: "Algeria", flag: "🇩🇿", dial: "+213" },
  { code: "EC", name: "Ecuador", flag: "🇪🇨", dial: "+593" },
  { code: "EE", name: "Estonia", flag: "🇪🇪", dial: "+372" },
  { code: "EG", name: "Egypt", flag: "🇪🇬", dial: "+20" },
  { code: "ER", name: "Eritrea", flag: "🇪🇷" },
  { code: "ES", name: "Spain", flag: "🇪🇸", dial: "+34" },
  { code: "ET", name: "Ethiopia", flag: "🇪🇹", dial: "+251" },
  { code: "FI", name: "Finland", flag: "🇫🇮", dial: "+358" },
  { code: "FJ", name: "Fiji", flag: "🇫🇯", dial: "+679" },
  { code: "FM", name: "Micronesia", flag: "🇫🇲" },
  { code: "FR", name: "France", flag: "🇫🇷", dial: "+33" },
  { code: "GA", name: "Gabon", flag: "🇬🇦" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", dial: "+44" },
  { code: "GD", name: "Grenada", flag: "🇬🇩" },
  { code: "GE", name: "Georgia", flag: "🇬🇪", dial: "+995" },
  { code: "GH", name: "Ghana", flag: "🇬🇭", dial: "+233" },
  { code: "GM", name: "Gambia", flag: "🇬🇲" },
  { code: "GN", name: "Guinea", flag: "🇬🇳" },
  { code: "GQ", name: "Equatorial Guinea", flag: "🇬🇶" },
  { code: "GR", name: "Greece", flag: "🇬🇷", dial: "+30" },
  { code: "GT", name: "Guatemala", flag: "🇬🇹" },
  { code: "GW", name: "Guinea-Bissau", flag: "🇬🇼" },
  { code: "GY", name: "Guyana", flag: "🇬🇾" },
  { code: "HK", name: "Hong Kong SAR China", flag: "🇭🇰", dial: "+852" },
  { code: "HN", name: "Honduras", flag: "🇭🇳" },
  { code: "HR", name: "Croatia", flag: "🇭🇷", dial: "+385" },
  { code: "HT", name: "Haiti", flag: "🇭🇹" },
  { code: "HU", name: "Hungary", flag: "🇭🇺", dial: "+36" },
  { code: "ID", name: "Indonesia", flag: "🇮🇩", dial: "+62" },
  { code: "IE", name: "Ireland", flag: "🇮🇪", dial: "+353" },
  { code: "IL", name: "Israel", flag: "🇮🇱", dial: "+972" },
  { code: "IN", name: "India", flag: "🇮🇳", dial: "+91" },
  { code: "IQ", name: "Iraq", flag: "🇮🇶", dial: "+964" },
  { code: "IR", name: "Iran", flag: "🇮🇷", dial: "+98" },
  { code: "IS", name: "Iceland", flag: "🇮🇸", dial: "+354" },
  { code: "IT", name: "Italy", flag: "🇮🇹", dial: "+39" },
  { code: "JM", name: "Jamaica", flag: "🇯🇲", dial: "+1876" },
  { code: "JO", name: "Jordan", flag: "🇯🇴", dial: "+962" },
  { code: "JP", name: "Japan", flag: "🇯🇵", dial: "+81" },
  { code: "KE", name: "Kenya", flag: "🇰🇪", dial: "+254" },
  { code: "KG", name: "Kyrgyzstan", flag: "🇰🇬" },
  { code: "KH", name: "Cambodia", flag: "🇰🇭", dial: "+855" },
  { code: "KI", name: "Kiribati", flag: "🇰🇮" },
  { code: "KM", name: "Comoros", flag: "🇰🇲" },
  { code: "KN", name: "St. Kitts & Nevis", flag: "🇰🇳" },
  { code: "KP", name: "North Korea", flag: "🇰🇵" },
  { code: "KR", name: "South Korea", flag: "🇰🇷", dial: "+82" },
  { code: "KW", name: "Kuwait", flag: "🇰🇼", dial: "+965" },
  { code: "KY", name: "Cayman Islands", flag: "🇰🇾" },
  { code: "KZ", name: "Kazakhstan", flag: "🇰🇿", dial: "+7" },
  { code: "LA", name: "Laos", flag: "🇱🇦", dial: "+856" },
  { code: "LB", name: "Lebanon", flag: "🇱🇧", dial: "+961" },
  { code: "LC", name: "St. Lucia", flag: "🇱🇨" },
  { code: "LI", name: "Liechtenstein", flag: "🇱🇮" },
  { code: "LK", name: "Sri Lanka", flag: "🇱🇰", dial: "+94" },
  { code: "LR", name: "Liberia", flag: "🇱🇷" },
  { code: "LS", name: "Lesotho", flag: "🇱🇸" },
  { code: "LT", name: "Lithuania", flag: "🇱🇹", dial: "+370" },
  { code: "LU", name: "Luxembourg", flag: "🇱🇺", dial: "+352" },
  { code: "LV", name: "Latvia", flag: "🇱🇻", dial: "+371" },
  { code: "LY", name: "Libya", flag: "🇱🇾", dial: "+218" },
  { code: "MA", name: "Morocco", flag: "🇲🇦", dial: "+212" },
  { code: "MC", name: "Monaco", flag: "🇲🇨" },
  { code: "MD", name: "Moldova", flag: "🇲🇩", dial: "+373" },
  { code: "ME", name: "Montenegro", flag: "🇲🇪", dial: "+382" },
  { code: "MG", name: "Madagascar", flag: "🇲🇬" },
  { code: "MH", name: "Marshall Islands", flag: "🇲🇭" },
  { code: "MK", name: "North Macedonia", flag: "🇲🇰", dial: "+389" },
  { code: "ML", name: "Mali", flag: "🇲🇱" },
  { code: "MM", name: "Myanmar (Burma)", flag: "🇲🇲", dial: "+95" },
  { code: "MN", name: "Mongolia", flag: "🇲🇳", dial: "+976" },
  { code: "MO", name: "Macao SAR China", flag: "🇲🇴", dial: "+853" },
  { code: "MR", name: "Mauritania", flag: "🇲🇷" },
  { code: "MT", name: "Malta", flag: "🇲🇹", dial: "+356" },
  { code: "MU", name: "Mauritius", flag: "🇲🇺", dial: "+230" },
  { code: "MV", name: "Maldives", flag: "🇲🇻", dial: "+960" },
  { code: "MW", name: "Malawi", flag: "🇲🇼" },
  { code: "MX", name: "Mexico", flag: "🇲🇽", dial: "+52" },
  { code: "MY", name: "Malaysia", flag: "🇲🇾", dial: "+60" },
  { code: "MZ", name: "Mozambique", flag: "🇲🇿", dial: "+258" },
  { code: "NA", name: "Namibia", flag: "🇳🇦", dial: "+264" },
  { code: "NE", name: "Niger", flag: "🇳🇪" },
  { code: "NG", name: "Nigeria", flag: "🇳🇬", dial: "+234" },
  { code: "NI", name: "Nicaragua", flag: "🇳🇮" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱", dial: "+31" },
  { code: "NO", name: "Norway", flag: "🇳🇴", dial: "+47" },
  { code: "NP", name: "Nepal", flag: "🇳🇵", dial: "+977" },
  { code: "NR", name: "Nauru", flag: "🇳🇷" },
  { code: "NZ", name: "New Zealand", flag: "🇳🇿", dial: "+64" },
  { code: "OM", name: "Oman", flag: "🇴🇲", dial: "+968" },
  { code: "PA", name: "Panama", flag: "🇵🇦", dial: "+507" },
  { code: "PE", name: "Peru", flag: "🇵🇪", dial: "+51" },
  { code: "PG", name: "Papua New Guinea", flag: "🇵🇬", dial: "+675" },
  { code: "PH", name: "Philippines", flag: "🇵🇭", dial: "+63" },
  { code: "PK", name: "Pakistan", flag: "🇵🇰", dial: "+92" },
  { code: "PL", name: "Poland", flag: "🇵🇱", dial: "+48" },
  { code: "PT", name: "Portugal", flag: "🇵🇹", dial: "+351" },
  { code: "PW", name: "Palau", flag: "🇵🇼" },
  { code: "PY", name: "Paraguay", flag: "🇵🇾", dial: "+595" },
  { code: "QA", name: "Qatar", flag: "🇶🇦", dial: "+974" },
  { code: "RO", name: "Romania", flag: "🇷🇴", dial: "+40" },
  { code: "RS", name: "Serbia", flag: "🇷🇸", dial: "+381" },
  { code: "RU", name: "Russia", flag: "🇷🇺", dial: "+7" },
  { code: "RW", name: "Rwanda", flag: "🇷🇼", dial: "+250" },
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦", dial: "+966" },
  { code: "SB", name: "Solomon Islands", flag: "🇸🇧" },
  { code: "SC", name: "Seychelles", flag: "🇸🇨", dial: "+248" },
  { code: "SD", name: "Sudan", flag: "🇸🇩", dial: "+249" },
  { code: "SE", name: "Sweden", flag: "🇸🇪", dial: "+46" },
  { code: "SG", name: "Singapore", flag: "🇸🇬", dial: "+65" },
  { code: "SI", name: "Slovenia", flag: "🇸🇮", dial: "+386" },
  { code: "SK", name: "Slovakia", flag: "🇸🇰", dial: "+421" },
  { code: "SL", name: "Sierra Leone", flag: "🇸🇱" },
  { code: "SM", name: "San Marino", flag: "🇸🇲" },
  { code: "SN", name: "Senegal", flag: "🇸🇳", dial: "+221" },
  { code: "SO", name: "Somalia", flag: "🇸🇴", dial: "+252" },
  { code: "SR", name: "Suriname", flag: "🇸🇷", dial: "+597" },
  { code: "SS", name: "South Sudan", flag: "🇸🇸" },
  { code: "ST", name: "São Tomé & Príncipe", flag: "🇸🇹" },
  { code: "SV", name: "El Salvador", flag: "🇸🇻" },
  { code: "SY", name: "Syria", flag: "🇸🇾", dial: "+963" },
  { code: "SZ", name: "Eswatini", flag: "🇸🇿" },
  { code: "TD", name: "Chad", flag: "🇹🇩" },
  { code: "TG", name: "Togo", flag: "🇹🇬" },
  { code: "TH", name: "Thailand", flag: "🇹🇭", dial: "+66" },
  { code: "TJ", name: "Tajikistan", flag: "🇹🇯", dial: "+992" },
  { code: "TL", name: "Timor-Leste", flag: "🇹🇱" },
  { code: "TM", name: "Turkmenistan", flag: "🇹🇲", dial: "+993" },
  { code: "TN", name: "Tunisia", flag: "🇹🇳", dial: "+216" },
  { code: "TO", name: "Tonga", flag: "🇹🇴" },
  { code: "TR", name: "Türkiye", flag: "🇹🇷", dial: "+90" },
  { code: "TT", name: "Trinidad & Tobago", flag: "🇹🇹" },
  { code: "TV", name: "Tuvalu", flag: "🇹🇻" },
  { code: "TW", name: "Taiwan", flag: "🇹🇼", dial: "+886" },
  { code: "TZ", name: "Tanzania", flag: "🇹🇿", dial: "+255" },
  { code: "UA", name: "Ukraine", flag: "🇺🇦", dial: "+380" },
  { code: "UG", name: "Uganda", flag: "🇺🇬", dial: "+256" },
  { code: "US", name: "United States", flag: "🇺🇸", dial: "+1" },
  { code: "UY", name: "Uruguay", flag: "🇺🇾", dial: "+598" },
  { code: "UZ", name: "Uzbekistan", flag: "🇺🇿", dial: "+998" },
  { code: "VA", name: "Vatican City", flag: "🇻🇦", dial: "+39" },
  { code: "VC", name: "St. Vincent & Grenadines", flag: "🇻🇨" },
  { code: "VE", name: "Venezuela", flag: "🇻🇪", dial: "+58" },
  { code: "VN", name: "Vietnam", flag: "🇻🇳", dial: "+84" },
  { code: "VU", name: "Vanuatu", flag: "🇻🇺" },
  { code: "WS", name: "Samoa", flag: "🇼🇸" },
  { code: "YE", name: "Yemen", flag: "🇾🇪", dial: "+967" },
  { code: "ZA", name: "South Africa", flag: "🇿🇦", dial: "+27" },
  { code: "ZM", name: "Zambia", flag: "🇿🇲", dial: "+260" },
  { code: "ZW", name: "Zimbabwe", flag: "🇿🇼", dial: "+263" },
];

export const COUNTRY_MAP: Record<string, Country> = Object.fromEntries(
  COUNTRIES.map((c) => [c.code, c]),
);

export function countryName(code?: string | null, fallback = "—"): string {
  if (!code) return fallback;
  return COUNTRY_MAP[code.toUpperCase()]?.name ?? code;
}

export function countryFlag(code?: string | null): string {
  if (!code) return "";
  return COUNTRY_MAP[code.toUpperCase()]?.flag ?? "";
}

export function dialCode(code?: string | null): string | undefined {
  if (!code) return undefined;
  return COUNTRY_MAP[code.toUpperCase()]?.dial;
}

/** Most VisaDrive applicants travel from India, so it leads the list. */
export const PRIORITY_ORIGIN_CODES = ["IN", "AE", "US", "GB", "CA", "AU", "SG"];

export const ORIGIN_COUNTRIES: Country[] = [
  ...PRIORITY_ORIGIN_CODES.map((c) => COUNTRY_MAP[c]).filter(Boolean),
  ...COUNTRIES.filter((c) => !PRIORITY_ORIGIN_CODES.includes(c.code)),
];

/** The six destinations this launch supports. */
export const LAUNCH_DESTINATION_CODES = ["AE", "VN", "JP", "US", "CN", "SG"] as const;

export type LaunchDestinationCode = (typeof LAUNCH_DESTINATION_CODES)[number];

/** Purpose-of-travel options shown in the discovery form. */
export const TRAVEL_PURPOSES = [
  { value: "tourist", label: "Tourism or leisure" },
  { value: "business", label: "Business or work meeting" },
  { value: "student", label: "Study" },
  { value: "transit", label: "Transit" },
  { value: "medical", label: "Medical treatment" },
  { value: "other", label: "Something else" },
] as const;
