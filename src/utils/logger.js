// Simple logging utility dengan level control
const LOG_LEVEL = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

const CURRENT_LEVEL = LOG_LEVEL.INFO; // Change to DEBUG untuk dev

const logger = {
    debug: (msg, data) => {
        if (CURRENT_LEVEL <= LOG_LEVEL.DEBUG) {
            console.log(`🔵 [DEBUG] ${msg}`, data || '');
        }
    },
    info: (msg, data) => {
        if (CURRENT_LEVEL <= LOG_LEVEL.INFO) {
            console.log(`🟢 [INFO] ${msg}`, data || '');
        }
    },
    warn: (msg, data) => {
        if (CURRENT_LEVEL <= LOG_LEVEL.WARN) {
            console.warn(`🟡 [WARN] ${msg}`, data || '');
        }
    },
    error: (msg, data) => {
        if (CURRENT_LEVEL <= LOG_LEVEL.ERROR) {
            console.error(`🔴 [ERROR] ${msg}`, data || '');
        }
    }
};

export default logger;
