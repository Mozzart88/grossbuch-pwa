// Currency data from exchange rate API
// decimal_places: most fiat = 2, JPY/KRW/etc = 0, crypto = 8, stablecoins = 6

export interface CurrencyData {
  code: string
  name: string
  symbol: string
  decimal_places: number
  is_crypto: boolean
}

// Currencies with 0 decimal places
const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'KPW',
  'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
])

// Currencies with 3 decimal places
const THREE_DECIMAL_CURRENCIES = new Set([
  'BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND',
])

// Bitcoin-like crypto with 8 decimal places
const EIGHT_DECIMAL_CRYPTO = new Set([
  'BTC', 'BCH', 'LTC', 'XBT', 'WBTC', 'CBBTC', 'FBTC', 'LBTC',
])

// Stablecoins with 6 decimal places
const SIX_DECIMAL_STABLECOINS = new Set([
  'USDT', 'USDC', 'DAI', 'USDE', 'USDS', 'USDD', 'PYUSD', 'RLUSD',
  'USDP', 'USD1', 'USDG', 'USDF', 'EURC', 'BFUSD', 'BSC-USD',
  'SUSDS', 'SUSDE', 'USYC', 'SYRUPUSDC', 'USDT0',
])

// Custom symbols for crypto without API symbols
const CRYPTO_SYMBOLS: Record<string, string> = {
  BTC: '₿',
  ETH: 'Ξ',
  LTC: 'Ł',
  USDT: '₮',
  USDC: '$C',
  DAI: '$D',
  USDE: '$E',
  USDS: '$S',
  PYUSD: '$P',
  RLUSD: '$R',
}

function getDecimalPlaces(code: string, isCrypto: boolean): number {
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return 0
  if (THREE_DECIMAL_CURRENCIES.has(code)) return 3
  if (EIGHT_DECIMAL_CRYPTO.has(code)) return 8
  if (SIX_DECIMAL_STABLECOINS.has(code)) return 6
  // Default: 2 for fiat, 8 for other crypto
  return isCrypto ? 8 : 2
}

function getSymbol(code: string, apiSymbol: string | null): string {
  if (apiSymbol) return apiSymbol
  if (CRYPTO_SYMBOLS[code]) return CRYPTO_SYMBOLS[code]
  if (code.toUpperCase().includes('USD')) code.toUpperCase().replace('USD', '$')
  return code
}

// Raw data from API (currencies.json)
const RAW_CURRENCIES: Array<{
  code: string
  name: string | null
  symbol: string | null
  crypto: number
}> = [
    // Fiat currencies
    { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', crypto: 0 },
    { code: 'AFN', name: 'Afghani', symbol: '؋', crypto: 0 },
    { code: 'ALL', name: 'Lek', symbol: 'L', crypto: 0 },
    { code: 'AMD', name: 'Armenian Dram', symbol: 'դր.', crypto: 0 },
    { code: 'ANG', name: 'Netherlands Antillean Guilder', symbol: 'ƒ', crypto: 0 },
    { code: 'AOA', name: 'Kwanza', symbol: 'Kz', crypto: 0 },
    { code: 'ARS', name: 'Argentine Peso', symbol: '$', crypto: 0 },
    { code: 'AUD', name: 'Australian Dollar', symbol: '$', crypto: 0 },
    { code: 'AWG', name: 'Aruban Florin', symbol: 'ƒ', crypto: 0 },
    { code: 'AZN', name: 'Azerbaijanian Manat', symbol: '₼', crypto: 0 },
    { code: 'BAM', name: 'Convertible Mark', symbol: 'КМ', crypto: 0 },
    { code: 'BBD', name: 'Barbados Dollar', symbol: '$', crypto: 0 },
    { code: 'BDT', name: 'Taka', symbol: '৳', crypto: 0 },
    { code: 'BGN', name: 'Bulgarian Lev', symbol: 'лв', crypto: 0 },
    { code: 'BHD', name: 'Bahraini Dinar', symbol: 'ب.د', crypto: 0 },
    { code: 'BIF', name: 'Burundi Franc', symbol: 'Fr', crypto: 0 },
    { code: 'BMD', name: 'Bermudian Dollar', symbol: '$', crypto: 0 },
    { code: 'BND', name: 'Brunei Dollar', symbol: '$', crypto: 0 },
    { code: 'BOB', name: 'Boliviano', symbol: 'Bs.', crypto: 0 },
    { code: 'BOV', name: 'Mvdol', symbol: 'Bs.', crypto: 0 },
    { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', crypto: 0 },
    { code: 'BSD', name: 'Bahamian Dollar', symbol: '$', crypto: 0 },
    { code: 'BTN', name: 'Ngultrum', symbol: 'Nu.', crypto: 0 },
    { code: 'BWP', name: 'Pula', symbol: 'P', crypto: 0 },
    { code: 'BYN', name: 'Belarussian Ruble', symbol: 'Br', crypto: 0 },
    { code: 'BZD', name: 'Belize Dollar', symbol: '$', crypto: 0 },
    { code: 'CAD', name: 'Canadian Dollar', symbol: '$', crypto: 0 },
    { code: 'CDF', name: 'Congolese Franc', symbol: 'Fr', crypto: 0 },
    { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', crypto: 0 },
    { code: 'CLF', name: 'Unidades de fomento', symbol: 'UF', crypto: 0 },
    { code: 'CLP', name: 'Chilean Peso', symbol: '$', crypto: 0 },
    { code: 'CNY', name: 'Yuan Renminbi', symbol: '¥', crypto: 0 },
    { code: 'COP', name: 'Colombian Peso', symbol: '$', crypto: 0 },
    { code: 'CRC', name: 'Costa Rican Colon', symbol: '₡', crypto: 0 },
    { code: 'CUC', name: 'Peso Convertible', symbol: '$', crypto: 0 },
    { code: 'CUP', name: 'Cuban Peso', symbol: '$', crypto: 0 },
    { code: 'CVE', name: 'Cape Verde Escudo', symbol: '$', crypto: 0 },
    { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč', crypto: 0 },
    { code: 'DJF', name: 'Djibouti Franc', symbol: 'Fdj', crypto: 0 },
    { code: 'DKK', name: 'Danish Krone', symbol: 'kr', crypto: 0 },
    { code: 'DOP', name: 'Dominican Peso', symbol: '$', crypto: 0 },
    { code: 'DZD', name: 'Algerian Dinar', symbol: 'د.ج', crypto: 0 },
    { code: 'EGP', name: 'Egyptian Pound', symbol: 'ج.م', crypto: 0 },
    { code: 'ERN', name: 'Nakfa', symbol: 'Nfk', crypto: 0 },
    { code: 'ETB', name: 'Ethiopian Birr', symbol: 'Br', crypto: 0 },
    { code: 'EUR', name: 'Euro', symbol: '€', crypto: 0 },
    { code: 'FJD', name: 'Fiji Dollar', symbol: '$', crypto: 0 },
    { code: 'FKP', name: 'Falkland Islands Pound', symbol: '£', crypto: 0 },
    { code: 'GBP', name: 'Pound Sterling', symbol: '£', crypto: 0 },
    { code: 'GEL', name: 'Lari', symbol: 'ლ', crypto: 0 },
    { code: 'GHS', name: 'Ghana Cedi', symbol: '₵', crypto: 0 },
    { code: 'GIP', name: 'Gibraltar Pound', symbol: '£', crypto: 0 },
    { code: 'GMD', name: 'Dalasi', symbol: 'D', crypto: 0 },
    { code: 'GNF', name: 'Guinea Franc', symbol: 'Fr', crypto: 0 },
    { code: 'GTQ', name: 'Quetzal', symbol: 'Q', crypto: 0 },
    { code: 'GYD', name: 'Guyana Dollar', symbol: '$', crypto: 0 },
    { code: 'HKD', name: 'Hong Kong Dollar', symbol: '$', crypto: 0 },
    { code: 'HNL', name: 'Lempira', symbol: 'L', crypto: 0 },
    { code: 'HRK', name: 'Croatian Kuna', symbol: 'kn', crypto: 0 },
    { code: 'HTG', name: 'Gourde', symbol: 'G', crypto: 0 },
    { code: 'HUF', name: 'Forint', symbol: 'Ft', crypto: 0 },
    { code: 'IDR', name: 'Rupiah', symbol: 'Rp', crypto: 0 },
    { code: 'ILS', name: 'New Israeli Sheqel', symbol: '₪', crypto: 0 },
    { code: 'INR', name: 'Indian Rupee', symbol: '₹', crypto: 0 },
    { code: 'IQD', name: 'Iraqi Dinar', symbol: 'ع.د', crypto: 0 },
    { code: 'IRR', name: 'Iranian Rial', symbol: '﷼', crypto: 0 },
    { code: 'ISK', name: 'Iceland Krona', symbol: 'kr', crypto: 0 },
    { code: 'JMD', name: 'Jamaican Dollar', symbol: '$', crypto: 0 },
    { code: 'JOD', name: 'Jordanian Dinar', symbol: 'د.ا', crypto: 0 },
    { code: 'JPY', name: 'Yen', symbol: '¥', crypto: 0 },
    { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', crypto: 0 },
    { code: 'KGS', name: 'Som', symbol: 'som', crypto: 0 },
    { code: 'KHR', name: 'Riel', symbol: '៛', crypto: 0 },
    { code: 'KMF', name: 'Comoro Franc', symbol: 'Fr', crypto: 0 },
    { code: 'KPW', name: 'North Korean Won', symbol: '₩', crypto: 0 },
    { code: 'KRW', name: 'Won', symbol: '₩', crypto: 0 },
    { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'د.ك', crypto: 0 },
    { code: 'KYD', name: 'Cayman Islands Dollar', symbol: '$', crypto: 0 },
    { code: 'KZT', name: 'Tenge', symbol: '〒', crypto: 0 },
    { code: 'LAK', name: 'Kip', symbol: '₭', crypto: 0 },
    { code: 'LBP', name: 'Lebanese Pound', symbol: 'ل.ل', crypto: 0 },
    { code: 'LKR', name: 'Sri Lanka Rupee', symbol: '₨', crypto: 0 },
    { code: 'LRD', name: 'Liberian Dollar', symbol: '$', crypto: 0 },
    { code: 'LSL', name: 'Loti', symbol: 'L', crypto: 0 },
    { code: 'LTL', name: 'Lithuanian Litas', symbol: 'Lt', crypto: 0 },
    { code: 'LVL', name: 'Latvian Lats', symbol: 'Ls', crypto: 0 },
    { code: 'LYD', name: 'Libyan Dinar', symbol: 'ل.د', crypto: 0 },
    { code: 'MAD', name: 'Moroccan Dirham', symbol: 'د.م.', crypto: 0 },
    { code: 'MDL', name: 'Moldovan Leu', symbol: 'L', crypto: 0 },
    { code: 'MGA', name: 'Malagasy Ariary', symbol: 'Ar', crypto: 0 },
    { code: 'MKD', name: 'Denar', symbol: 'ден', crypto: 0 },
    { code: 'MMK', name: 'Kyat', symbol: 'K', crypto: 0 },
    { code: 'MNT', name: 'Tugrik', symbol: '₮', crypto: 0 },
    { code: 'MOP', name: 'Pataca', symbol: 'P', crypto: 0 },
    { code: 'MRO', name: 'Ouguiya', symbol: 'UM', crypto: 0 },
    { code: 'MUR', name: 'Mauritius Rupee', symbol: '₨', crypto: 0 },
    { code: 'MVR', name: 'Rufiyaa', symbol: 'MVR', crypto: 0 },
    { code: 'MWK', name: 'Kwacha', symbol: 'MK', crypto: 0 },
    { code: 'MXN', name: 'Mexican Peso', symbol: '$', crypto: 0 },
    { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', crypto: 0 },
    { code: 'MZN', name: 'Mozambique Metical', symbol: 'MTn', crypto: 0 },
    { code: 'NAD', name: 'Namibia Dollar', symbol: '$', crypto: 0 },
    { code: 'NGN', name: 'Naira', symbol: '₦', crypto: 0 },
    { code: 'NIO', name: 'Cordoba Oro', symbol: 'C$', crypto: 0 },
    { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr', crypto: 0 },
    { code: 'NPR', name: 'Nepalese Rupee', symbol: '₨', crypto: 0 },
    { code: 'NZD', name: 'New Zealand Dollar', symbol: '$', crypto: 0 },
    { code: 'OMR', name: 'Rial Omani', symbol: 'ر.ع.', crypto: 0 },
    { code: 'PAB', name: 'Balboa', symbol: 'B/.', crypto: 0 },
    { code: 'PEN', name: 'Sol', symbol: 'S/', crypto: 0 },
    { code: 'PGK', name: 'Kina', symbol: 'K', crypto: 0 },
    { code: 'PHP', name: 'Philippine Peso', symbol: '₱', crypto: 0 },
    { code: 'PKR', name: 'Pakistan Rupee', symbol: '₨', crypto: 0 },
    { code: 'PLN', name: 'Zloty', symbol: 'zł', crypto: 0 },
    { code: 'PYG', name: 'Guarani', symbol: '₲', crypto: 0 },
    { code: 'QAR', name: 'Qatari Rial', symbol: 'ر.ق', crypto: 0 },
    { code: 'RON', name: 'New Romanian Leu', symbol: 'Lei', crypto: 0 },
    { code: 'RSD', name: 'Serbian Dinar', symbol: 'РСД', crypto: 0 },
    { code: 'RUB', name: 'Russian Ruble', symbol: '₽', crypto: 0 },
    { code: 'RWF', name: 'Rwanda Franc', symbol: 'FRw', crypto: 0 },
    { code: 'SAR', name: 'Saudi Riyal', symbol: 'ر.س', crypto: 0 },
    { code: 'SBD', name: 'Solomon Islands Dollar', symbol: '$', crypto: 0 },
    { code: 'SCR', name: 'Seychelles Rupee', symbol: '₨', crypto: 0 },
    { code: 'SDG', name: 'Sudanese Pound', symbol: '£', crypto: 0 },
    { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', crypto: 0 },
    { code: 'SGD', name: 'Singapore Dollar', symbol: '$', crypto: 0 },
    { code: 'SHP', name: 'Saint Helena Pound', symbol: '£', crypto: 0 },
    { code: 'SLL', name: 'Leone', symbol: 'Le', crypto: 0 },
    { code: 'SOS', name: 'Somali Shilling', symbol: 'Sh', crypto: 0 },
    { code: 'SRD', name: 'Surinam Dollar', symbol: '$', crypto: 0 },
    { code: 'SSP', name: 'South Sudanese Pound', symbol: '£', crypto: 0 },
    { code: 'STD', name: 'Dobra', symbol: 'Db', crypto: 0 },
    { code: 'SVC', name: 'El Salvador Colon', symbol: '₡', crypto: 0 },
    { code: 'SYP', name: 'Syrian Pound', symbol: '£S', crypto: 0 },
    { code: 'SZL', name: 'Lilangeni', symbol: 'E', crypto: 0 },
    { code: 'THB', name: 'Baht', symbol: '฿', crypto: 0 },
    { code: 'TJS', name: 'Somoni', symbol: 'ЅМ', crypto: 0 },
    { code: 'TMT', name: 'Turkmenistan New Manat', symbol: 'T', crypto: 0 },
    { code: 'TND', name: 'Tunisian Dinar', symbol: 'د.ت', crypto: 0 },
    { code: 'TOP', name: "Pa'anga", symbol: 'T$', crypto: 0 },
    { code: 'TRY', name: 'Turkish Lira', symbol: '₺', crypto: 0 },
    { code: 'TTD', name: 'Trinidad and Tobago Dollar', symbol: '$', crypto: 0 },
    { code: 'TWD', name: 'New Taiwan Dollar', symbol: '$', crypto: 0 },
    { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'Sh', crypto: 0 },
    { code: 'UAH', name: 'Hryvnia', symbol: '₴', crypto: 0 },
    { code: 'UGX', name: 'Uganda Shilling', symbol: 'USh', crypto: 0 },
    { code: 'USD', name: 'US Dollar', symbol: '$', crypto: 0 },
    { code: 'UYU', name: 'Peso Uruguayo', symbol: '$', crypto: 0 },
    { code: 'UZS', name: 'Uzbekistan Sum', symbol: 'лв', crypto: 0 },
    { code: 'VEF', name: 'Bolivar', symbol: 'Bs F', crypto: 0 },
    { code: 'VND', name: 'Dong', symbol: '₫', crypto: 0 },
    { code: 'VUV', name: 'Vatu', symbol: 'Vt', crypto: 0 },
    { code: 'WST', name: 'Tala', symbol: 'T', crypto: 0 },
    { code: 'XAF', name: 'CFA Franc BEAC', symbol: 'Fr', crypto: 0 },
    { code: 'XCD', name: 'East Caribbean Dollar', symbol: '$', crypto: 0 },
    { code: 'XOF', name: 'CFA Franc BCEAO', symbol: 'Fr', crypto: 0 },
    { code: 'XPF', name: 'CFP Franc', symbol: 'Fr', crypto: 0 },
    { code: 'YER', name: 'Yemeni Rial', symbol: '﷼', crypto: 0 },
    { code: 'ZAR', name: 'Rand', symbol: 'R', crypto: 0 },
    { code: 'ZMW', name: 'Zambian Kwacha', symbol: 'ZK', crypto: 0 },
    { code: 'ZWL', name: 'Zimbabwe Dollar', symbol: '$', crypto: 0 },

    // Major cryptocurrencies
    { code: 'BTC', name: 'Bitcoin', symbol: null, crypto: 1 },
    { code: 'ETH', name: 'Ethereum', symbol: null, crypto: 1 },
    { code: 'BNB', name: 'BNB', symbol: null, crypto: 1 },
    { code: 'SOL', name: 'Solana', symbol: null, crypto: 1 },
    { code: 'XRP', name: 'XRP', symbol: null, crypto: 1 },
    { code: 'ADA', name: 'Cardano', symbol: null, crypto: 1 },
    { code: 'DOGE', name: 'Dogecoin', symbol: null, crypto: 1 },
    { code: 'DOT', name: 'Polkadot', symbol: null, crypto: 1 },
    { code: 'LTC', name: 'Litecoin', symbol: null, crypto: 1 },
    { code: 'BCH', name: 'Bitcoin Cash', symbol: null, crypto: 1 },
    { code: 'LINK', name: 'Chainlink', symbol: null, crypto: 1 },
    { code: 'XLM', name: 'Stellar', symbol: null, crypto: 1 },
    { code: 'XMR', name: 'Monero', symbol: null, crypto: 1 },
    { code: 'TRX', name: 'TRON', symbol: null, crypto: 1 },
    { code: 'UNI', name: 'Uniswap', symbol: null, crypto: 1 },
    { code: 'AAVE', name: 'Aave', symbol: null, crypto: 1 },
    { code: 'ALGO', name: 'Algorand', symbol: null, crypto: 1 },
    { code: 'APT', name: 'Aptos', symbol: null, crypto: 1 },
    { code: 'ARB', name: 'Arbitrum', symbol: null, crypto: 1 },
    { code: 'ATOM', name: 'Cosmos Hub', symbol: null, crypto: 1 },
    { code: 'AVAX', name: 'Avalanche', symbol: null, crypto: 1 },
    { code: 'BGB', name: 'Bitget Token', symbol: null, crypto: 1 },
    { code: 'CRO', name: 'Cronos', symbol: null, crypto: 1 },
    { code: 'ENA', name: 'Ethena', symbol: null, crypto: 1 },
    { code: 'ETC', name: 'Ethereum Classic', symbol: null, crypto: 1 },
    { code: 'FIL', name: 'Filecoin', symbol: null, crypto: 1 },
    { code: 'HBAR', name: 'Hedera', symbol: null, crypto: 1 },
    { code: 'HYPE', name: 'Hyperliquid', symbol: null, crypto: 1 },
    { code: 'ICP', name: 'Internet Computer', symbol: null, crypto: 1 },
    { code: 'KAS', name: 'Kaspa', symbol: null, crypto: 1 },
    { code: 'LEO', name: 'LEO Token', symbol: null, crypto: 1 },
    { code: 'NEAR', name: 'NEAR Protocol', symbol: null, crypto: 1 },
    { code: 'OKB', name: 'OKB', symbol: null, crypto: 1 },
    { code: 'ONDO', name: 'Ondo', symbol: null, crypto: 1 },
    { code: 'PEPE', name: 'Pepe', symbol: null, crypto: 1 },
    { code: 'PI', name: 'Pi Network', symbol: null, crypto: 1 },
    { code: 'POL', name: 'POL (ex-MATIC)', symbol: null, crypto: 1 },
    { code: 'QNT', name: 'Quant', symbol: null, crypto: 1 },
    { code: 'RENDER', name: 'Render', symbol: null, crypto: 1 },
    { code: 'SHIB', name: 'Shiba Inu', symbol: null, crypto: 1 },
    { code: 'SUI', name: 'Sui', symbol: null, crypto: 1 },
    { code: 'TAO', name: 'Bittensor', symbol: null, crypto: 1 },
    { code: 'TON', name: 'Toncoin', symbol: null, crypto: 1 },
    { code: 'WLD', name: 'Worldcoin', symbol: null, crypto: 1 },
    { code: 'ZEC', name: 'Zcash', symbol: null, crypto: 1 },
    { code: 'GT', name: 'Gate', symbol: null, crypto: 1 },
    { code: 'HTX', name: 'HTX DAO', symbol: null, crypto: 1 },
    { code: 'KCS', name: 'KuCoin', symbol: null, crypto: 1 },
    { code: 'SKY', name: 'Sky', symbol: null, crypto: 1 },
    { code: 'TRUMP', name: 'Official Trump', symbol: null, crypto: 1 },
    { code: 'PUMP', name: 'Pump.fun', symbol: null, crypto: 1 },
    { code: 'ASTER', name: 'Aster', symbol: null, crypto: 1 },
    { code: 'M', name: 'MemeCore', symbol: null, crypto: 1 },
    { code: 'RAIN', name: 'Rain', symbol: null, crypto: 1 },
    { code: 'WLFI', name: 'World Liberty Financial', symbol: null, crypto: 1 },
    { code: 'CC', name: 'Canton', symbol: null, crypto: 1 },
    { code: 'HASH', name: 'Provenance Blockchain', symbol: null, crypto: 1 },
    { code: 'MYX', name: 'MYX Finance', symbol: null, crypto: 1 },

    // Stablecoins
    { code: 'USDT', name: 'Tether', symbol: null, crypto: 1 },
    { code: 'USDC', name: 'USD Coin', symbol: null, crypto: 1 },
    { code: 'DAI', name: 'Dai', symbol: null, crypto: 1 },
    { code: 'USDE', name: 'Ethena USDe', symbol: null, crypto: 1 },
    { code: 'USDS', name: 'USDS', symbol: null, crypto: 1 },
    { code: 'USDD', name: 'USDD', symbol: null, crypto: 1 },
    { code: 'PYUSD', name: 'PayPal USD', symbol: null, crypto: 1 },
    { code: 'RLUSD', name: 'Ripple USD', symbol: null, crypto: 1 },
    { code: 'USDP', name: 'Pax Dollar', symbol: null, crypto: 1 },
    { code: 'USD1', name: 'USD1', symbol: null, crypto: 1 },
    { code: 'USDG', name: 'Global Dollar', symbol: null, crypto: 1 },
    { code: 'USDF', name: 'Falcon USD', symbol: null, crypto: 1 },
    { code: 'EURC', name: 'Euro Coin', symbol: null, crypto: 1 },
    { code: 'BFUSD', name: 'BFUSD', symbol: null, crypto: 1 },
    { code: 'BSC-USD', name: 'Binance Bridged USDT', symbol: null, crypto: 1 },
    { code: 'SUSDS', name: 'sUSDS', symbol: null, crypto: 1 },
    { code: 'SUSDE', name: 'Ethena Staked USDe', symbol: null, crypto: 1 },
    { code: 'USYC', name: 'Circle USYC', symbol: null, crypto: 1 },
    { code: 'SYRUPUSDC', name: 'syrupUSDC', symbol: null, crypto: 1 },
    { code: 'USDT0', name: 'USDT0', symbol: null, crypto: 1 },

    // Wrapped/Staked tokens
    { code: 'WBTC', name: 'Wrapped Bitcoin', symbol: null, crypto: 1 },
    { code: 'CBBTC', name: 'Coinbase Wrapped BTC', symbol: null, crypto: 1 },
    { code: 'FBTC', name: 'Function FBTC', symbol: null, crypto: 1 },
    { code: 'LBTC', name: 'Lombard Staked BTC', symbol: null, crypto: 1 },
    { code: 'WETH', name: 'Wrapped Ether', symbol: null, crypto: 1 },
    { code: 'STETH', name: 'Lido Staked Ether', symbol: null, crypto: 1 },
    { code: 'WSTETH', name: 'Wrapped stETH', symbol: null, crypto: 1 },
    { code: 'WEETH', name: 'Wrapped eETH', symbol: null, crypto: 1 },
    { code: 'RETH', name: 'Rocket Pool ETH', symbol: null, crypto: 1 },
    { code: 'WBETH', name: 'Wrapped Beacon ETH', symbol: null, crypto: 1 },
    { code: 'RSETH', name: 'Kelp DAO Restaked ETH', symbol: null, crypto: 1 },
    { code: 'WBNB', name: 'Wrapped BNB', symbol: null, crypto: 1 },
    { code: 'BNSOL', name: 'Binance Staked SOL', symbol: null, crypto: 1 },
    { code: 'JITOSOL', name: 'Jito Staked SOL', symbol: null, crypto: 1 },
    { code: 'JLP', name: 'Jupiter Perpetuals LP', symbol: null, crypto: 1 },

    // Gold-backed tokens
    { code: 'PAXG', name: 'PAX Gold', symbol: null, crypto: 1 },
    { code: 'XAUT', name: 'Tether Gold', symbol: null, crypto: 1 },

    // DeFi and other tokens
    { code: 'BUIDL', name: 'BlackRock USD Fund', symbol: null, crypto: 1 },

  ]

// Remove duplicates and build final list
const seenCodes = new Set<string>()
export const CURRENCIES: CurrencyData[] = RAW_CURRENCIES.filter((c) => {
  if (seenCodes.has(c.code)) return false
  seenCodes.add(c.code)
  return true
}).map((c) => ({
  code: c.code,
  name: c.name || c.code,
  symbol: getSymbol(c.code, c.symbol),
  decimal_places: getDecimalPlaces(c.code, c.crypto === 1),
  is_crypto: c.crypto === 1,
}))

export function getCurrencyByCode(code: string): CurrencyData | undefined {
  return CURRENCIES.find((c) => c.code === code)
}
