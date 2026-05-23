# Magic bytes

[![Build and test](https://github.com/LarsKoelpin/magic-bytes/actions/workflows/build-and-test.yml/badge.svg)](https://github.com/LarsKoelpin/magic-bytes/actions/workflows/build-and-test.yml)

Magic Bytes is a javascript library analyzing the first bytes of a file to tell you its type. 
Use it inside your browser or serversided using nodejs.

The procedure is based on https://en.wikipedia.org/wiki/List_of_file_signatures.


> [!NOTE]  
> A small note on versioning.
> Strictly speaking, each new filetype which is supported by this library can break someones' API.
> Please note that this library adds new filetypes with minor release.
> This means files, which validate to "null" in some versions, may find a result in a new version.
> 
> Or in some cases the library will find more results, than before. So don't depend on the found-array size in
> any shape or form.
> Filetypes will not be removed though.

# Installation
Run `npm install magic-bytes.js`


# Interactive example
There is an interactive example present at https://larskoelpin.github.io/magic-bytes/.

# Usage

The following functions are available:
* `filetypeinfo(bytes: number[])` Contains typeinformation like name, extension and mime type: `[{typename: "zip"}, {typename: "jar"}]`
* `filetypename(bytes: number[])` : Contains type names only: `["zip", "jar"]`
* `filetypemime(bytes: number[])` : Contains type mime types only: `["application/zip", "application/jar"]`
* `filetypeextension(bytes: number[])` : Contains type extensions only: `["zip", "jar"]`
* `register(fileType: string, string[])`: registers a custom signature

Both function return an empty array `[]` otherwise, which means it could not detect the file signature. Keep in mind that
txt files for example fall in this category.

You don't have to load the whole file in memory. For validating a file uploaded to S3 using Lambda for example, it may be  
enough to load the files first 100 bytes and validate against them.  This is especially useful for big files.

see examples for practical usage.

On server:
```javascript
import filetype from 'magic-bytes.js'

filetype(fs.readFileSync("myimage.png")) // ["png"]
```


To run an HTML-Example checkout the project and run

```
npm install; npm run example
```

This opens an HTML example using magic bytes as a window variable. It kinda looks like that.

```html
<input type="file" id="file" />

 <script src="node_modules/magic-bytes.js/dist/browser.js" type="application/javascript"></script>
<script>
    document.getElementById("file").addEventListener('change', (event, x) => {
      const fileReader = new FileReader();
      fileReader.onloadend = (f) => {
        const bytes = new Uint8Array(f.target.result);
        console.log("Possible filetypes: " + filetypeinfo(bytes))
      }
      fileReader.readAsArrayBuffer(event.target.files[0])
    })
</script>
```


# Tests
Run  `npm test`

# Example
See examples/

# How does it work
The `create-snapshot.js` creates a new tree. The tree has a similar shape to the following 
```json
{
  "0x47": {
    "0x49": {
      "0x46": {
        "0x38": {
          "0x37": {
            "0x61": {
              "matches": [
                {
                  "typename": "gif",
                  "mime": "image/gif",
                  "extension": "gif"
                }
              ]
            }
          },
        }
      }
    }
  }
}
```

It acts as a giant lookup map for the given byte signatures.
