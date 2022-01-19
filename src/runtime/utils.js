export let __app_onerror = console.error;

export const configure = (option) => {
  __app_onerror = option.onerror;
};

export const isFunction = fn => typeof fn == 'function';

export const isObject = d => typeof d == 'object';

export const safeCall = fn => {
  try {
    return fn?.();
  } catch (e) {
    __app_onerror(e);
  }
};

export const safeGroupCall = list => {
  try {
    list.forEach(fn => fn?.())
  } catch (e) {
    __app_onerror(e);
  }
}
