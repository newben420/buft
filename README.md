# Bitget USDT-M Futures Trader (BUFT)

Just a bot. Maybe I should build this publicly... Just for fun...

This wont use my usual networked microservice architecture. It will be on a single process with a telegram bot interface, and, without any persistence. Tailored to run on free nodejs hosting providers.

Also with hardcoded strategy and multilayering.

UPDATE: it now has a pluggable json rule-based strategy.

## Update 19/04/2025 1PM WAT

Done.


***Disclaimer***  
This repo is public only because I felt like developing this project in public. Please do not use the sourcecodes for trading. If you must, at least completely understand how it works. You can use it for reference though.

Here is a sample .env file.

```sh
# --- APP CONFIG
TITLE="Buft" # A special name for your application
PORT="4010" # Port 
PRODUCTION="false" # debug logs are shown when "false" and hidden otherwise
PROD_URL="https://example.com" # URL in production that can be used by telegram webhook when polling is disabled
FORCE_FAMILY_4="true" # set as true to force IPv4 when resolving DNS as some errors might be caused when nodejs is unable to resolve IPv6
FLOW_LOG_MAX_PRIORITY="5" # just for logging
EXIT_ON_UNCAUGHT_EXCEPTION="true" # kill process on exception
EXIT_ON_UNHANDLED_REJECTION="false" # kill process on rejection

# --- TICKER CONFIG
TK_PRODUCT_TYPE="USDT-FUTURES" # bitget futures product type
TK_MARGIN_COIN="USDT" # bitget futures margin coin
TK_AUTO_SYMBOLS="" # space separated symbols for tickers you would like to be added automatically e.g BTCUSDT ETHUSDT
TK_MAX="200" # maximum amount of tickers at a time
TK_GRANULARITY="3m" #granularity for candlestick data used for analysis. possible values are: 1m, 3m, 5m, 15m, 30m, 1H, 4H, 6H, 12H, 1D, 3D, 1W, 1M , 6Hutc, 12Hutc, 1Dutc, 3Dutc, 1Wutc, 1Mutc
TK_MAX_ROWS="100" # max rows of candlestick data to use for analysis
TK_LEVERAGE_LONG="20" # leverage for long orders in isolated margin mode
TK_LEVERAGE_SHORT="20" # leverage for short orders in isolated margin mode
TK_LEVERAGE_CROSS="20" # leverage in cross margin mode

# --- ANALYSIS CONFIG
AS_MIN_ROWS="10" # min rows for analysis

# --- COLLECTOR CONFIG
CL_SYMBOLS="" # space separated symbols to collect data for when running collector script e.g BTCUSDT
CL_ROWS="1000" # total number or rows to collect
CL_MAX_ROWS_PER_FETCH="200" # max candlestick rows per fetch

# --- TRADER CONFIG
TR_AUTO_ENABLED="false" # whether to automatically enable signal execution
TR_GRID_LENGTH="1" # number of trades that can be taken at a time. balance is divided by this to get capital
TR_MAX_CAPITAL_MCOIN="10" # maximum capital value in margin coin
TR_SIGNAL_BLACKLIST="No_Signal Corrected_Signal" # signals that are blacklisted
TR_POS_UPDATE_INTERVAL_MS="1000" # interval to update positions 
TR_MARGIN_MODE="isolated" #"isolated" or "crossed"
TR_CAPITAL_RATIO_FOR_TRADE="0.8" # percentage of capital to use for orders. so fees can be left when necessary.
# TAKE PROFIT GUIDE
# "TP" TO USE TRAILING STOP LOSS PERCENTAGE MULTIPLIED BY LEVERAGE 
# "VOL" TO USE VOLATILITY PERCENTAGE MULTIPLIED BY LEVERAGE
# A POSITIVE NUMERIC VALUE, NOT MULTIPLIED BY LEVERAGE
# 0 OR NEGATIVE NUMBER TO NOT USE TAKE PROFIT 
TR_TAKE_PROFIT="TP"
# STOP LOSS GUIDE
# "SL" TO USE TRAILING STOP LOSS PERCENTAGE MULTIPLIED BY LEVERAGE 
# "VOL" TO USE VOLATILITY PERCENTAGE MULTIPLIED BY LEVERAGE
# A POSITIVE NUMERIC VALUE, NOT MULTIPLIED BY LEVERAGE
# 0 OR NEGATIVE NUMBER TO NOT USE STOP LOSS 
TR_STOP_LOSS="TP"
TR_PEAK_DROP_MIN_DROP="4" # blah blah blah
TR_PROFIT_ORDER_MAX_DURATION_MS="0" # blah blah blah
TR_LOSS_ORDER_MAX_DURATION_MS="0" # blah blah blah

# --- FINDER CONFIG
FI_SAVE_PATH="/home/deez/Desktop/nuts.json" # blah blah blah

# --- INDICATORS CONFIG
IN_MIN_CONFIDENCE="50"
IN_DIRECTION_MAX_LENGTH="5"
IN_BOOLEAN_THRESHOLD_MIN_RATIO="0.75"
IN_MACD_FAST_PERIOD="5"
IN_MACD_SLOW_PERIOD="13"
IN_MACD_SIGNAL_PERIOD="3"
IN_MA_PERIOD="3"
IN_AO_FAST_PERIOD="2"
IN_AO_SLOW_PERIOD="8"
IN_FI_PERIOD="5"
IN_BB_PERIOD="10"
IN_BB_STDDEV="1.5"
IN_PSAR_STEP="0.04"
IN_PSAR_MAX="0.4"
IN_STOCH_PERIOD="5"
IN_STOCH_SIGNAL_PERIOD="2"
IN_MAX_SIGNAL_HISTORY_LENGTH="5"
IN_ML_COLLECT_DATA="false"

# --- TELEGRAM CONFIG
TG_TOKEN="fsjhfshsfh:dnsjfjfj-fnjsjfs"
TG_CHAT_ID="123456783"
TG_POLLING="true"
TG_SEND_START="true"
TG_SEND_STOP="true"
TG_SEND_CREATE_ORDER="true"
TG_WH_SECRET_TOKEN="2NFEEFBUUFEFE"
TG_MESSAGE_DURATION_MS="30000"
TG_BOT_URL="https://t.me/username_bot"

# --- BITGET CONFIG
BG_API_KEY=""
BG_API_SECRET=""
BG_API_PASSPHRASE=""
```

## Support

Contact me if you wanna F S up