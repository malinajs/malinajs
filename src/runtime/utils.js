
export let __app_onerror = console.error;


export const configure = (option) => {
    __app_onerror = option.onerror;
};


export const safeCall = fn => {
    try {
        return fn();
    } catch (e) {
        __app_onerror(e);
    }
}
