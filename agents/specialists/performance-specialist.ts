import { createSpecialist } from './create-specialist'
export default createSpecialist({
  id: 'performance-specialist',
  displayName: 'Performance Specialist',
  purpose:
    'Designs and evaluates profiling and benchmark evidence for latency, throughput, allocation, and hot-path changes.',
  terminal: true,
  intelligence: ['environment', 'builds'],
  focus: [
    'Measurement design and fixed baselines',
    'Hot paths and algorithmic complexity',
    'Allocation, I/O, and concurrency costs',
    'Statistical before/after evidence',
  ],
})
