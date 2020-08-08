
export let __app_onerror = console.error;

export const configure = (option) => {
    __app_onerror = option.onerror;
};
