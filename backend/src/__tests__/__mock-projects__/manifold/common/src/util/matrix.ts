import { max, sumBy } from 'lodash'

// each row has [column, value] pairs
type SparseMatrix = [number, number][][]

// Code originally from: https://github.com/johnpaulada/matrix-factorization-js/blob/master/src/matrix-factorization.js
// Used to implement recommendations through collaborative filtering: https://towardsdatascience.com/recommender-systems-matrix-factorization-using-pytorch-bd52f46aa199
// See also: https://en.wikipedia.org/wiki/Matrix_factorization_(recommender_systems)

/**
 * Gets the factors of a sparse matrix
 *
 * @param TARGET_MATRIX target matrix, where each row specifies a subset of all columns.
 * @param FEATURES Number of latent features
 * @param ITERS Number of times to move towards the real factors
 * @param LEARNING_RATE Learning rate
 * @param REGULARIZATION_RATE Regularization amount, i.e. amount of bias reduction
 * @returns An array containing the two factor matrices
 */
export function factorizeMatrix(
  TARGET_MATRIX: SparseMatrix,
  FEATURES = 5,
  ITERS = 5000,
  LEARNING_RATE = 0.0002,
  REGULARIZATION_RATE = 0.02,
  THRESHOLD = 0.001
) {
  const initCell = () => (2 * Math.random()) / FEATURES
  const m = TARGET_MATRIX.length
  const n = (max(TARGET_MATRIX.flatMap((r) => r.map(([j]) => j))) ?? -1) + 1
  const points = sumBy(TARGET_MATRIX, (r) => r.length)
  const mFeatures = fillMatrix(m, FEATURES, initCell)
  const nFeatures = fillMatrix(n, FEATURES, initCell)

  console.log('rows', m, 'columns', n, 'numPoints', points)

  const updateFeature = (a: number, b: number, error: number) =>
    a + LEARNING_RATE * (2 * error * b - REGULARIZATION_RATE * a)

  const dotProduct = (i: number, j: number) => {
    let result = 0
    for (let k = 0; k < FEATURES; k++) {
      result += mFeatures[i * FEATURES + k] * nFeatures[j * FEATURES + k]
    }
    return result
  }

  // Iteratively figure out correct factors.
  for (let iter = 0; iter < ITERS; iter++) {
    for (let i = 0; i < m; i++) {
      for (const [j, targetValue] of TARGET_MATRIX[i]) {
        // to approximate the value for target_ij, we take the dot product of the features for m[i] and n[j]
        const error = targetValue - dotProduct(i, j)
        // update factor matrices
        for (let k = 0; k < FEATURES; k++) {
          const a = mFeatures[i * FEATURES + k]
          const b = nFeatures[j * FEATURES + k]
          mFeatures[i * FEATURES + k] = updateFeature(a, b, error)
          nFeatures[j * FEATURES + k] = updateFeature(b, a, error)
        }
      }
    }

    if (iter % 50 === 0 || iter === ITERS - 1) {
      let totalError = 0
      for (let i = 0; i < m; i++) {
        for (const [j, targetValue] of TARGET_MATRIX[i]) {
          // add up squared error of current approximated value
          totalError += (targetValue - dotProduct(i, j)) ** 2
          // mqp: idk what this part of the error means lol
          for (let k = 0; k < FEATURES; k++) {
            const a = mFeatures[i * FEATURES + k]
            const b = nFeatures[j * FEATURES + k]
            totalError += (REGULARIZATION_RATE / 2) * (a ** 2 + b ** 2)
          }
        }
      }
      console.log(iter, 'error', totalError / points)

      // Complete factorization process if total error falls below a certain threshold
      if (totalError / points < THRESHOLD) break
    }
  }

  return [mFeatures, nFeatures, dotProduct] as const
}

/**
 * Creates an m x n matrix filled with the result of given fill function.
 */
function fillMatrix(m: number, n: number, fill: () => number) {
  const matrix = new Float64Array(m * n)
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      matrix[i * n + j] = fill()
    }
  }
  return matrix
}
