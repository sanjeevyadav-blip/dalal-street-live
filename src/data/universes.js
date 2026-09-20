// Static reference data: the indices on the board, the searchable directory, the peer
// groups, and the stock universes the screener and ranking tables draw from.
//
// Ticker universes rot. Companies merge and rename, and Yahoo stops resolving the old
// symbol without saying so — TATAMOTORS became TMPV, ZOMATO became ETERNAL, and LTIM has
// no working variant at all. tests/regression/universes.test.js asserts none of the known
// dead symbols come back, and EPIC-4 story E4-1 adds a startup pass that reports dead ones
// rather than silently dropping the row.

export const INDICES = [
  { symbol:'^NSEI',   name:'NIFTY 50',   full:'NSE — 50 large-cap benchmark' },
  { symbol:'^BSESN',  name:'SENSEX',     full:'BSE — 30-share benchmark' },
  { symbol:'^NSEBANK',name:'NIFTY BANK', full:'NSE — banking sector index' },
];

export const NIFTY_SYMBOL = '^NSEI';

export const STOCK_DIRECTORY = [
  ['RELIANCE','Reliance Industries'],['TCS','Tata Consultancy Services'],['HDFCBANK','HDFC Bank'],
  ['ICICIBANK','ICICI Bank'],['INFY','Infosys'],['HINDUNILVR','Hindustan Unilever'],['ITC','ITC'],
  ['SBIN','State Bank of India'],['BHARTIARTL','Bharti Airtel'],['BAJFINANCE','Bajaj Finance'],
  ['KOTAKBANK','Kotak Mahindra Bank'],['LT','Larsen & Toubro'],['HCLTECH','HCL Technologies'],
  ['ASIANPAINT','Asian Paints'],['AXISBANK','Axis Bank'],['MARUTI','Maruti Suzuki'],
  ['SUNPHARMA','Sun Pharmaceutical'],['TITAN','Titan Company'],['ULTRACEMCO','UltraTech Cement'],
  ['WIPRO','Wipro'],['NESTLEIND','Nestle India'],['ONGC','Oil & Natural Gas Corp'],['NTPC','NTPC'],
  ['POWERGRID','Power Grid Corp'],['M&M','Mahindra & Mahindra'],['TATASTEEL','Tata Steel'],
  ['TMPV','Tata Motors Passenger Vehicles'],['JSWSTEEL','JSW Steel'],['ADANIENT','Adani Enterprises'],
  ['ADANIPORTS','Adani Ports'],['COALINDIA','Coal India'],['BAJAJFINSV','Bajaj Finserv'],
  ['HDFCLIFE','HDFC Life Insurance'],['SBILIFE','SBI Life Insurance'],['DRREDDY',"Dr. Reddy's Labs"],
  ['CIPLA','Cipla'],['DIVISLAB',"Divi's Laboratories"],['GRASIM','Grasim Industries'],
  ['BRITANNIA','Britannia Industries'],['EICHERMOT','Eicher Motors'],['HEROMOTOCO','Hero MotoCorp'],
  ['BAJAJ-AUTO','Bajaj Auto'],['APOLLOHOSP','Apollo Hospitals'],['TECHM','Tech Mahindra'],
  ['INDUSINDBK','IndusInd Bank'],['UPL','UPL Limited'],['BPCL','Bharat Petroleum'],
  ['HINDALCO','Hindalco Industries'],['DMART','Avenue Supermarts (DMart)'],['PIDILITIND','Pidilite Industries'],
  ['DABUR','Dabur India'],['GODREJCP','Godrej Consumer Products'],['HAVELLS','Havells India'],
  ['SIEMENS','Siemens'],['PNB','Punjab National Bank'],['BANKBARODA','Bank of Baroda'],
  ['IDFCFIRSTB','IDFC First Bank'],['ETERNAL','Eternal (formerly Zomato)'],['IRCTC','IRCTC'],
  ['VEDL','Vedanta'],['GAIL','GAIL India'],['IOC','Indian Oil Corp'],['HAL','Hindustan Aeronautics'],
  ['BEL','Bharat Electronics'],['BOSCHLTD','Bosch'],['PGHH','P&G Hygiene'],['COLPAL','Colgate-Palmolive'],
  ['MARICO','Marico'],['BERGEPAINT','Berger Paints'],['AMBUJACEM','Ambuja Cements'],['ACC','ACC Limited'],
  ['LICI','Life Insurance Corp (LIC)'],['INDIGO','InterGlobe Aviation (IndiGo)'],['TATACONSUM','Tata Consumer Products'],
  ['TATAPOWER','Tata Power'],['ADANIGREEN','Adani Green Energy'],['ADANIPOWER','Adani Power'],
  ['TVSMOTOR','TVS Motor'],['MOTHERSON','Samvardhana Motherson'],['CANBK','Canara Bank'],
  ['PFC','Power Finance Corp'],['RECLTD','REC Limited'],['SAIL','Steel Authority of India'],
  ['NMDC','NMDC'],['BHARATFORG','Bharat Forge'],['ASHOKLEY','Ashok Leyland'],['ESCORTS','Escorts Kubota'],
  ['SHRIRAMFIN','Shriram Finance'],['PERSISTENT','Persistent Systems'],['MPHASIS','Mphasis'],['COFORGE','Coforge'],
  ['JUBLFOOD','Jubilant FoodWorks'],['TRENT','Trent'],['PIIND','PI Industries'],['SRF','SRF Limited'],
  ['ABB','ABB India'],['CUMMINSIND','Cummins India'],['HDFCAMC','HDFC AMC'],['ICICIPRULI','ICICI Prudential Life'],
  ['ICICIGI','ICICI Lombard'],['MUTHOOTFIN','Muthoot Finance'],['CHOLAFIN','Cholamandalam Investment'],
  ['LUPIN','Lupin'],['AUROPHARMA','Aurobindo Pharma'],['BIOCON','Biocon'],['ALKEM','Alkem Laboratories'],
  ['TORNTPHARM','Torrent Pharmaceuticals'],['GLENMARK','Glenmark Pharmaceuticals'],['PAYTM','One97 (Paytm)'],
];

export const PEER_GROUPS = [
  ['IT Services', ['TCS','INFY','HCLTECH','WIPRO','TECHM','MPHASIS','COFORGE','PERSISTENT']],
  ['Private Banks', ['HDFCBANK','ICICIBANK','KOTAKBANK','AXISBANK','INDUSINDBK','IDFCFIRSTB']],
  ['PSU Banks', ['SBIN','BANKBARODA','PNB','CANBK']],
  ['NBFC / Finance', ['BAJFINANCE','BAJAJFINSV','CHOLAFIN','MUTHOOTFIN','PFC','RECLTD','HDFCAMC']],
  ['Insurance', ['HDFCLIFE','SBILIFE','ICICIPRULI','ICICIGI','LICI']],
  ['Oil, Gas & Energy', ['RELIANCE','ONGC','BPCL','IOC','GAIL']],
  ['Power & Utilities', ['NTPC','POWERGRID','TATAPOWER','ADANIGREEN','ADANIPOWER']],
  ['Metals & Mining', ['TATASTEEL','JSWSTEEL','HINDALCO','VEDL','SAIL','NMDC','COALINDIA']],
  ['Automobiles', ['MARUTI','TMPV','M&M','EICHERMOT','HEROMOTOCO','BAJAJ-AUTO','TVSMOTOR','ASHOKLEY']],
  ['Auto Components', ['MOTHERSON','BHARATFORG','BOSCHLTD','ESCORTS']],
  ['Pharma', ['SUNPHARMA','DRREDDY','CIPLA','DIVISLAB','LUPIN','AUROPHARMA','TORNTPHARM','ALKEM','GLENMARK','BIOCON']],
  ['FMCG', ['HINDUNILVR','ITC','NESTLEIND','BRITANNIA','DABUR','MARICO','GODREJCP','COLPAL','TATACONSUM','PGHH']],
  ['Cement & Construction', ['ULTRACEMCO','GRASIM','AMBUJACEM','ACC','LT']],
  ['Paints & Chemicals', ['ASIANPAINT','BERGEPAINT','PIDILITIND','SRF','PIIND','UPL']],
  ['Consumer & Retail', ['DMART','TRENT','TITAN','JUBLFOOD','HAVELLS']],
  ['Telecom & Internet', ['BHARTIARTL','ETERNAL','PAYTM','IRCTC','INDIGO']],
  ['Capital Goods & Defence', ['SIEMENS','ABB','CUMMINSIND','HAL','BEL']],
  ['Healthcare Services', ['APOLLOHOSP']],
];

export const UNIV_LARGE = ['RELIANCE','TCS','HDFCBANK','ICICIBANK','INFY','HINDUNILVR','ITC','SBIN','BHARTIARTL','LT',
  'KOTAKBANK','AXISBANK','MARUTI','SUNPHARMA','TITAN','ULTRACEMCO','BAJFINANCE','HCLTECH','NTPC','POWERGRID',
  'M&M','TMPV','TATASTEEL','ASIANPAINT','WIPRO','ADANIPORTS','COALINDIA','ONGC','JSWSTEEL','NESTLEIND',
  'BAJAJFINSV','TECHM','GRASIM','HINDALCO','DRREDDY','CIPLA','BRITANNIA','EICHERMOT','HEROMOTOCO','INDUSINDBK',
  'ADANIENT','APOLLOHOSP','BAJAJ-AUTO','BPCL','DIVISLAB','HDFCLIFE','SBILIFE','TATACONSUM','UPL','SHRIRAMFIN',
  'DMART','VEDL','IOC','GAIL','SIEMENS'];

export const UNIV_MID = ['PERSISTENT','COFORGE','MPHASIS','CUMMINSIND','BHARATFORG','ESCORTS','ALKEM','GLENMARK','TORNTPHARM','JUBLFOOD',
  'TRENT','PIIND','SRF','ABB','HDFCAMC','MUTHOOTFIN','CHOLAFIN','LUPIN','AUROPHARMA','BIOCON',
  'HAVELLS','DABUR','MARICO','GODREJCP','BERGEPAINT','TVSMOTOR','ASHOKLEY','CANBK','PFC','RECLTD',
  'BEL','HAL','IRCTC','NMDC','SAIL','BANKBARODA','PNB','IDFCFIRSTB','ICICIGI','ICICIPRULI',
  'COLPAL','PGHH','BOSCHLTD','AMBUJACEM','ACC','TATAPOWER','ADANIGREEN','ADANIPOWER','MOTHERSON','ETERNAL',
  'PAYTM','INDIGO','LICI','POLYCAB','BANKINDIA'];

export const FACTOR_LARGE = ['RELIANCE','TCS','HDFCBANK','ICICIBANK','INFY','HINDUNILVR','ITC','SBIN','BHARTIARTL','LT','KOTAKBANK','MARUTI'];

export const FACTOR_SMALL = ['PERSISTENT','COFORGE','MPHASIS','CUMMINSIND','BHARATFORG','ESCORTS','ALKEM','GLENMARK','TORNTPHARM','JUBLFOOD','TRENT','SRF'];

export const COUNTS = [10,15,20,30,50];
