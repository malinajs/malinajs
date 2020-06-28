
### Malina.js

Web development compiler, inspired by Svelte.js

[Try Malina.js online](https://malinajs.github.io/repl/index.html)


Run dev environment:
```
npx degit malinajs/template myapp
cd myapp
npm install
npm run dev
# open http://localhost:7000/
```


Run dev environment (docker):
```
docker run --rm -it --user ${UID} -p 7000:7000 -p 35729:35729 -v `pwd`:/app/src lega911/malina
# open http://localhost:7000/
```


Build compiler
```
npm install
npm run build
```
