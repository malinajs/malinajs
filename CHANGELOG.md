
## 0.6.x

* style's attribute "global"
* compound classes (handle mix of class and class directives)
* new passing class
* mark a class as external "$className"
* Deprecated: passing class from 0.5
* plugins
* esbuild-plugin (by AlexxNB)
* $context
* onError
* $onMount
* $onDestroy
* alias for import: malinajs -> malinajs/runtime.js
* alias @click -> @click={click}, @@click is forwarding
* local config "malina.config.js"
* plugin sass/scss
* key "auto" for each-block
* anchors for components
* style templates, e.g. style:color={color}, style:border-color="red", style:border="1px solid {color}"
* compile option "css"
* event modifier: stop, prevent
* script option "read-only"
* constant props - "export const prop;"
* compile option: debugLabel
* slot for fragment
* exported fragments (inverted slots)
* <malina:head>, <malina:body>, <malina:window>
* option: passClass
* option: immutable

## 0.5.x

* input with type "range"/"number" - value as number
* improve reactive expression
* unwrap object in each
* dynamic component
* named slot
* fix for dynamic import
* option.onerror
* autosubscribe for imported objects
* compile time optinoption !no-check
* fragments
* event modifier: stopPropagation
* $props, $attributes, $restProps
* await-then-catch
* :global classes
* spreading props and objects {...obj}
* forwarding events, forward all @@
* onMount, onDestroy, $onDestroy
* shortcuts for bindings and actions
* scoped-css
* conrol directives: each, if
