
export let __app_onerror;

export const appConfigure = (option) => {
    __app_onerror = option.onerror || console.error;
};
