import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import {
  CopyLinkOrShareButton,
  CopyLinkRow,
} from 'web/components/buttons/copy-link-button'
import { Page } from 'web/components/layout/page'
import { type Rating, StarRating } from 'web/components/reviews/stars'
import { ColorSection } from 'web/components/styles/colors'
import { AlertBox } from 'web/components/widgets/alert-box'
import { AmountInput } from 'web/components/widgets/amount-input'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { TextEditor, useTextEditor } from 'web/components/widgets/editor'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { Input } from 'web/components/widgets/input'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Select } from 'web/components/widgets/select'
import ShortToggle from 'web/components/widgets/short-toggle'
import { RangeSlider, Slider } from 'web/components/widgets/slider'
import { Subtitle } from 'web/components/widgets/subtitle'
import { Title } from 'web/components/widgets/title'

export default function StylePage() {
  return (
    <Page trackPageView={'styles page'} className="gap-2">
      <div>
        <Title>Design System</Title>
        <ol className="text-ink-900 list-inside list-decimal">
          <li>keep line lengths between 45 and 75 ch</li>
          <li>use classNames. say no to "just one more prop bro"</li>
          <li>don't do anything that would make Inga scowl</li>
        </ol>
      </div>
      <ColorSection />
      <Subtitle>Buttons</Subtitle>
      <ButtonSection />
      <Subtitle>Toggles</Subtitle>
      <ToggleSection />
      <Subtitle>Loading</Subtitle>
      <div className="flex flex-wrap gap-2">
        <LoadingIndicator size="sm" />
        <LoadingIndicator size="md" />
        <LoadingIndicator />
      </div>
      <Subtitle>Inputs</Subtitle>
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Input" />
        <Input disabled placeholder="Input disabled=true" />
        <Input error placeholder="Input error=true" />
        <NumberInputExample />
      </div>
      <ExpandingInput
        className="w-full"
        placeholder="ExpandingInput (try typing a lot)"
      />
      <EditorExample />
      <SliderExample />
      <Subtitle>Copy Link</Subtitle>
      <CopyLinkOrShareButton
        url="www.example.com"
        eventTrackingName={'copy styles link'}
        tooltip="Share"
      />
      <div />
      <CopyLinkRow
        url="www.example.com"
        eventTrackingName={'copy styles link'}
      />
      <Subtitle>Other random stuff</Subtitle>
      <Rating />
      <AlertBox title="Alert box">this is a warning message!</AlertBox>
      <AlertBox title="Alert box with no text" />
    </Page>
  )
}

function ButtonSection() {
  const [disabled, setDisabled] = useState(false)
  const [loading, setLoading] = useState(false)

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button disabled={disabled} loading={loading}>
          indigo
        </Button>
        <Button disabled={disabled} loading={loading} color="indigo-outline">
          indigo-outline
        </Button>
        <Button disabled={disabled} loading={loading} color="gradient">
          gradient
        </Button>
        <Button disabled={disabled} loading={loading} color="gradient-pink">
          gradient-pink
        </Button>
        <Button disabled={disabled} loading={loading} color="gold">
          gold
        </Button>
        <Button disabled={disabled} loading={loading} color="blue">
          blue
        </Button>
        <Button disabled={disabled} loading={loading} color="gray">
          gray
        </Button>
        <Button disabled={disabled} loading={loading} color="gray-outline">
          gray-outline
        </Button>
        <Button disabled={disabled} loading={loading} color="gray-white">
          gray-white
        </Button>
        <Button disabled={disabled} loading={loading} color="green">
          green
        </Button>
        <Button disabled={disabled} loading={loading} color="green-outline">
          green-outline
        </Button>
        <Button disabled={disabled} loading={loading} color="yellow">
          yellow
        </Button>
        <Button disabled={disabled} loading={loading} color="yellow-outline">
          yellow-outline
        </Button>
        <Button disabled={disabled} loading={loading} color="red">
          red
        </Button>
        <Button disabled={disabled} loading={loading} color="red-outline">
          red-outline
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={disabled} loading={loading} size="2xs">
          2xs
        </Button>
        <Button disabled={disabled} loading={loading} size="xs">
          xs
        </Button>
        <Button disabled={disabled} loading={loading} size="sm">
          sm
        </Button>
        <Button disabled={disabled} loading={loading}>
          md
        </Button>
        <Button disabled={disabled} loading={loading} size="lg">
          lg
        </Button>
        <Button disabled={disabled} loading={loading} size="xl">
          xl
        </Button>
        <Button disabled={disabled} loading={loading} size="2xl">
          2xl
        </Button>
      </div>
      <div className="text-ink-600 flex gap-4">
        <label className="flex items-center gap-2">
          Disable
          <ShortToggle on={disabled} setOn={setDisabled} />
        </label>
        <label className="flex items-center gap-2">
          Loading
          <ShortToggle on={loading} setOn={setLoading} />
        </label>
      </div>
    </>
  )
}

function ToggleSection() {
  const [on, setOn] = useState(false)
  const [choice, setChoice] = useState('TRINARY')
  const [color, setColor] = useState('indigo-dark')
  const [disabled, setDisabled] = useState(false)

  return (
    <div className="flex flex-col gap-2 text-sm">
      <label className="flex items-center gap-2">
        ShortToggle
        <ShortToggle on={on} setOn={setOn} disabled={disabled} />
      </label>
      <div className="flex items-center gap-2">
        ChoicesToggleGroup
        <ChoicesToggleGroup
          currentChoice={choice}
          disabled={disabled}
          color={color as any}
          setChoice={setChoice as any}
          choicesMap={{
            'YES / NO / IDK ': 'TRINARY',
            'Single choice': 'FPTP',
            'Deluxe response': 'CERT',
            Perpetual: 'SUDO_NUMERIC',
          }}
        />
      </div>
      <div className="flex items-center gap-2">
        Select (native)
        <Select
          value={color}
          onChange={(e) => setColor(e.target.value)}
          disabled={disabled}
        >
          <option>indigo-dark</option>
          <option>indigo</option>
          <option>red</option>
          <option>green</option>
        </Select>
      </div>
      <label className="text-ink-600 flex items-center gap-2">
        Disable
        <ShortToggle on={disabled} setOn={setDisabled} />
      </label>
    </div>
  )
}

function NumberInputExample() {
  const [value, setValue] = useState<number>()
  return <AmountInput amount={value} onChangeAmount={setValue} />
}

function EditorExample() {
  const editor = useTextEditor({
    defaultValue: '<p>Rich text editor from <code>editor.tsx</code></p>',
  })
  return <TextEditor editor={editor} />
}

function SliderExample() {
  const [amount, setAmount] = useState<number>(0)
  const [low, setLow] = useState<number>(0)
  const [high, setHigh] = useState<number>(100)

  return (
    <>
      <Slider
        // min={0}
        // max={100}
        // color="green"
        amount={amount}
        onChange={setAmount}
      />
      <RangeSlider
        lowValue={low}
        highValue={high}
        setValues={(low, high) => {
          setLow(low)
          setHigh(high)
        }}
      />
    </>
  )
}

function Rating() {
  const [rating, setRating] = useState<number>()
  return (
    <StarRating
      rating={rating as any}
      onClick={(rating: Rating) => setRating(rating)}
    />
  )
}
