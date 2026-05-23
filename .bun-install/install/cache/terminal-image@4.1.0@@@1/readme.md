# terminal-image

> Display images in the terminal

Works in any terminal that supports colors.

<img src="screenshot.png" width="1082">

*In iTerm, Kitty, WezTerm, and other terminals with graphics support, the image will be displayed in full resolution. In other terminals, it will be rendered using ANSI block characters.*

## Install

```sh
npm install terminal-image
```

## Usage

```js
import terminalImage from 'terminal-image';

console.log(await terminalImage.file('unicorn.jpg'));
```

Optionally, you can specify the `height` and/or `width` to scale the image. That can be either the percentage of the terminal window or number of rows and/or columns. Please note that the image will always be scaled to fit the size of the terminal. If width and height are not defined, by default the image will take the width and height of the terminal.

It is recommended to use the percentage option.

```js
import terminalImage from 'terminal-image';

console.log(await terminalImage.file('unicorn.jpg', {width: '50%', height: '50%'}));
```

You can set width and/or height as columns and/or rows of the terminal window as well.

```js
import terminalImage from 'terminal-image';

console.log(await terminalImage.file('unicorn.jpg', {width: 50}));
```

By default, aspect ratio is always maintained. If you don't want to maintain aspect ratio, set `preserveAspectRatio` to false. However, your image will be scaled to fit the size of the terminal.

```js
import terminalImage from 'terminal-image';

console.log(await terminalImage.file('unicorn.jpg', {width: 70, height: 50, preserveAspectRatio: false}));
```

## API

Supports PNG and JPEG images. Animated GIFs are also supported with `.gifBuffer` and `.gifFile`.

### terminalImage.buffer(imageBuffer, options?)
### terminalImage.file(filePath, options?)

Returns a `Promise<string>` with the ANSI escape codes to display the image.

### terminalImage.gifBuffer(imageBuffer, options?)
### terminalImage.gifFile(filePath, options?)

Returns a function that can be called to stop the GIF animation.

#### options

Type: `object`

##### height

Type: `string | number`

Custom image height.

Can be set as percentage or number of rows of the terminal. It is recommended to use the percentage options.

##### width

Type: `string | number`

Custom image width.

Can be set as percentage or number of columns of the terminal. It is recommended to use the percentage options.

##### preserveAspectRatio

Type: `boolean`\
Default: `true`

Whether to maintain image aspect ratio or not.

##### preferNativeRender

Type: `boolean`\
Default: `true`

Prefer native terminal image protocols when available; set to false to force ANSI rendering.

##### maximumFrameRate

**Only works for `terminalImage.gifBuffer` or `terminalImage.gifFile`**

Type: `number`\
Default: `30`

Maximum framerate to render the GIF. This option is ignored when using iTerm.

##### renderFrame

**Only works for `terminalImage.gifBuffer` or `terminalImage.gifFile`**

Type: `(text: string) => void`\
Default: [log-update](https://github.com/sindresorhus/log-update)

Custom handler which is run for each frame of the GIF.

This can be set to change how each frame is shown.

##### renderFrame.done

**Only works for `terminalImage.gifBuffer` or `terminalImage.gifFile`**

Type: `() => void`\
Default: [log-update](https://github.com/sindresorhus/log-update)

Custom handler which is run when the animation playback is stopped.

This can be set to perform a cleanup when playback has finished.

## Terminal Protocol Support

It automatically detects and uses the best available protocol:

1. **Kitty Graphics Protocol** - Full resolution support in Kitty, Konsole, WezTerm (when configured)
1. **iTerm2 Inline Images Protocol** - Full resolution support in iTerm2 and compatible terminals
1. **ANSI Block Characters** - Universal fallback using Unicode half-blocks with 24-bit color

## Tip

### Display a remote image

```js
import terminalImage from 'terminal-image';
import got from 'got';

const body = await got('https://sindresorhus.com/unicorn').buffer();
console.log(await terminalImage.buffer(body));
```

## Related

- [terminal-image-cli](https://github.com/sindresorhus/terminal-image-cli) - CLI for this module
- [terminal-link](https://github.com/sindresorhus/terminal-link) - Create clickable links in the terminal
- [chalk](https://github.com/chalk/chalk) - Style and color text in the terminal
