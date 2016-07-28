// Flow control elements for lab.js
import { Component, status, handMeDowns } from './core'
import { shuffle } from 'lodash-es'
import deprecation from './util/deprecation'

// Helper function to handle nested elements
const prepareNested = function(nested, parent) {
  // Setup parent links on nested items
  nested.forEach(c => (c.parent = parent))

  // Set ids on nested items
  nested.forEach((c, i) => {
    // For each child, use this element's id
    // and append a counter
    if (parent.id == null) {
      c.id = String(i)
    } else {
      c.id = [parent.id, i].join('_')
    }
  })

  // Pass on specified attributes
  nested.forEach(c => {
    parent.handMeDowns.forEach(k => {
      c[k] = c[k] || parent[k]
    })
  })

  // Trigger prepare on all nested elements
  return Promise.all(
    nested.map(c => c.prepare(false)) // indicate indirect call
  )
}

// A sequence combines an array of other
// elements and runs them sequentially
export class Sequence extends Component {
  constructor(options={}) {
    // Deprecate multiple arguments in constructor
    options = deprecation.multiArgumentConstructor(
      options, arguments, ['content'], 'Sequence'
    )

    super(options)

    // Define an array of nested elements to
    // iterate over
    this.content = options.content || []

    // Define a position in the array to begin
    // (note that this is incremented before
    // running the first nested element)
    this.currentPosition = -1

    // Shuffle items, if so desired
    this.shuffle = options.shuffle || false

    // Use default hand-me-downs
    // unless directed otherwise
    // (note that the hand-me-downs are copied)
    this.handMeDowns = options.handMeDowns || [...handMeDowns]
  }

  prepare(directCall) {
    const p = super.prepare(directCall)

    // Shuffle content, if requested
    if (this.shuffle) {
      this.content = shuffle(this.content)
    }

    // Prepare nested items
    return p.then(
      () => prepareNested(this.content, this)
    )
  }

  onRun() {
    // Run the sequence by stepping through the
    // content elements
    this.step()
  }

  onEnd() {
    // Remove stepper function
    this.stepper = null

    // End prematurely, if necessary
    if (this.currentPosition !== this.content.length) {
      const currentElement = this.content[this.currentPosition]

      // Don't continue stepping through content
      // FIXME: This should only remove
      // the stepper function, but no others
      currentElement.off('after:end')
      currentElement.end('abort by sequence')
    }
  }

  step(increment=+1, keepGoing=true) {
    // The step method is unique to sequences,
    // and defines how the next content element
    // is chosen and shown.
    this.triggerMethod('step')

    // Increment the current position
    this.currentPosition += increment

    // If there ist still content yet to be shown,
    // show it while waiting for it to complete,
    // otherwise we are done here.
    if (this.currentPosition !== this.content.length) {
      this.currentElement = this.content[this.currentPosition]

      if (keepGoing) {
        this.stepper = () => this.step()
        this.currentElement.once('after:end', this.stepper)
      }

      this.currentElement.run()
    } else {
      this.currentElement = null
      this.end('complete')
    }
  }
}

Sequence.module = ['flow']

// A loop functions exactly like a sequence,
// except that the elements in the loop are
// generated upon initialization from a
// factory function and a data collection.
// Technically, the content is generated by
// mapping the data onto the factory function.
export class Loop extends Sequence {
  constructor(options={}) {
    // Deprecate multiple arguments in constructor
    options = deprecation.multiArgumentConstructor(
      options, arguments, ['elementFactory', 'data'], 'Loop'
    )

    // Generate the content by applying
    // the elementFactory function to each
    // entry in the data array
    options.content = options.data.map(options.elementFactory)

    // Otherwise, behave exactly
    // as a sequence would
    super(options)
  }
}

Loop.module = ['flow']

// A parallel element executes multiple
// other elements simultaneously
export class Parallel extends Component {
  constructor(options={}) {
    // Deprecate multiple arguments in constructor
    options = deprecation.multiArgumentConstructor(
      options, arguments, ['content'], 'Parallel'
    )

    super(options)

    // The content, in this case,
    // consists of an array of elements
    // that are run in parallel.
    this.content = options.content

    // Save options
    this.mode = options.mode || 'race'
    this.handMeDowns = options.handMeDowns || [...handMeDowns]
  }

  prepare(directCall) {
    const p = super.prepare(directCall)

    // Prepare nested items
    return p.then(
      () => prepareNested(this.content, this)
    )
  }

  // The run method is overwritten at this point,
  // because the original promise is swapped for a
  // version that runs all nested items in parallel
  run() {
    const promise = super.run()

    // Run all nested elements simultaneously
    this.promises = this.content.map(c => c.run())

    // End this element when all nested elements,
    // or a single element, have ended
    Promise[this.mode](this.promises)
      .then(() => this.end())

    return promise
  }

  onEnd() {
    // Cancel remaining running nested elements
    this.content.forEach(c => {
      if (c.status < status.done) {
        c.end('abort by parallel')
      }
    })
  }
}

Parallel.module = ['flow']
