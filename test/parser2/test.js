
const assert = require('assert');
const malinajs = require('malinajs');


async function main() {
  let root = malinajs.parseHTML(`
    <div>
      <h1 title="header">Title</h1>
      <hr>
      <span id=1 name|mod:val={someBinding("text", 2 + 5)} {bind}>some text</span>
      <fragment:some-info />
      {binding({a: "}"})}
      <^anchor />
      <!-- comment -->
      {#if cond}
        true
      {:else}
        false
      {/if}
    </div>
  `);

  const body = root.body[1].body;
  root.body[1].body = null;

  const root0 = {
    "type": "root",
    "body": [
      {
        "type": "text",
        "value": "\n    "
      },
      {
        "type": "node",
        "name": "div",
        "elArg": null,
        "openTag": "<div>",
        "start": 5,
        "end": 10,
        "closedTag": false,
        "voidTag": false,
        "attributes": [],
        "classes": new Set(),
        "body": null
      },
      {
        "type": "text",
        "value": "\n  "
      }
    ]
  };

  assert.deepEqual(root, root0);

  const body0 = [
    {
      "type": "text",
      "value": "\n      "
    },
    {
      "type": "node",
      "name": "h1",
      "elArg": null,
      "openTag": "<h1 title=\"header\">",
      "start": 17,
      "end": 36,
      "closedTag": false,
      "voidTag": false,
      "attributes": [
        {
          "content": "title=\"header\"",
          "name": "title",
          "value": "header",
          "raw": '"header"'
        }
      ],
      "classes": new Set(),
      "body": [
        {
          "type": "text",
          "value": "Title"
        }
      ]
    },
    {
      "type": "text",
      "value": "\n      "
    },
    {
      "type": "node",
      "name": "hr",
      "elArg": null,
      "openTag": "<hr>",
      "start": 53,
      "end": 57,
      "closedTag": true,
      "voidTag": true,
      "attributes": [],
      "classes": new Set()
    },
    {
      "type": "text",
      "value": "\n      "
    },
    {
      "type": "node",
      "name": "span",
      "elArg": null,
      "openTag": "<span id=1 name|mod:val={someBinding(\"text\", 2 + 5)} {bind}>",
      "start": 64,
      "end": 124,
      "closedTag": false,
      "voidTag": false,
      "attributes": [
        {
          "content": "id=1",
          "name": "id",
          "value": "1",
          "raw": '1'
        },
        {
          "content": "name|mod:val={someBinding(\"text\", 2 + 5)}",
          "name": "name|mod:val",
          "value": "{someBinding(\"text\", 2 + 5)}",
          "raw": "{someBinding(\"text\", 2 + 5)}"
        },
        {
          "name": "bind",
          "value": "{bind}",
          "raw": "{bind}",
          "content": "{bind}"
        }
      ],
      "classes": new Set(),
      "body": [
        {
          "type": "text",
          "value": "some text"
        }
      ]
    },
    {
      "type": "text",
      "value": "\n      "
    },
    {
      "type": "node",
      "name": "fragment",
      "elArg": "some-info",
      "openTag": "<fragment:some-info />",
      "start": 147,
      "end": 169,
      "closedTag": true,
      "voidTag": false,
      "attributes": [],
      "classes": new Set()
    },
    {
      "type": "text",
      "value": "\n      {binding({a: \"}\"})}\n      "
    },
    {
      "type": "node",
      "name": "^anchor",
      "elArg": null,
      "openTag": "<^anchor />",
      "start": 202,
      "end": 213,
      "closedTag": true,
      "voidTag": false,
      "attributes": [],
      "classes": new Set()
    },
    {
      "type": "text",
      "value": "\n      "
    },
    {
      "type": "comment",
      "content": "<!-- comment -->"
    },
    {
      "type": "text",
      "value": "\n      "
    },
    {
      "type": "if",
      "parts": [
        {
          "value": "#if cond",
          "body": [
            {
              "type": "text",
              "value": "\n        true\n      "
            }
          ]
        }
      ],
      "elsePart": [
        {
          "type": "text",
          "value": "\n        false\n      "
        }
      ]
    },
    {
      "type": "text",
      "value": "\n    "
    }
  ];

  assert.strictEqual(body.length, body0.length);

  for(let i=0; i<body0.length; i++) {
    assert.deepEqual(body[i], body0[i]);
  }

}

module.exports = { main };
