
import App from 'main.xht';

let app = window.app = App(window.$$option);
document.body.innerHTML = '';
document.body.appendChild(app.$dom);
