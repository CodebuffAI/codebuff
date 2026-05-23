'use strict'

/*!
 * Canvas - CanvasPattern
 * Copyright (c) 2010 LearnBoost <tj@learnboost.com>
 * MIT Licensed
 */

const bindings = require('./bindings')

module.exports = bindings.CanvasPattern

bindings.CanvasPattern.prototype.toString = function () {
	return '[object CanvasPattern]'
}
