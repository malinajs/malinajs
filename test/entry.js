
import { mount } from 'malinajs';
import App from 'main.xht';

document.body.innerHTML = '';
window.app = mount(document.body, App, window.$$option);
