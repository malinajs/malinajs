
## Malina.js

<img align="right" width="200" height="200" src="malinajs2.png" />

Malina.js builds your web-application to use it **without framework on frontend side**. Therefore your web-app becomes thinner and faster, and the application itself consist of **vanilla JavaScript**, look at [examples](https://malinajs.github.io/repl/). [TodoMVC example](https://malina-todomvc.surge.sh) **2.7kb** (gzipped) and [source code](https://github.com/malinajs/todomvc)


* [Docs](https://malinajs.github.io/docs/)
* [Syntax Highlighter for VS-Code](https://marketplace.visualstudio.com/items?itemName=AlexxNB.malina-js-highlight)
* **[Try Malina.js online (REPL)](https://malinajs.github.io/repl/)**

#### Articles
* [Comparision with Svelte.js](https://medium.com/@lega911/svelte-js-and-malina-js-b33c55253271)
* [Comparision with Vue 3](https://medium.com/@lega911/vue-3-vs-malina-js-abd97025ba81)
* [Passing CSS classes to child components](https://medium.com/@lega911/how-a-popular-feature-declined-by-svelte-went-live-in-malina-js-1a08fdb9dbc4)
* [Using fragments](https://medium.com/@lega911/how-fragments-can-help-in-your-web-development-5efc4d10f9da)

#### Example
```html
<script>
  let name = 'world';
    
  function rename() {
    name = 'user';
  }
</script>

<h1>Hello {name.toUpperCase()}!</h1>
<button @click={rename}>Rename</button>
```

#### Run dev environment:
```
npx create-malina myapp
cd myapp
npm run dev
# open http://localhost:7000/
```


#### Run dev environment via docker:
```
docker run --rm -it --user ${UID} -p 7000:7000 -p 35729:35729 -v `pwd`:/app/src lega911/malina
# open http://localhost:7000/
```


Build compiler
```
npm install
npm run build
```


## License

[MIT](LICENSE)
