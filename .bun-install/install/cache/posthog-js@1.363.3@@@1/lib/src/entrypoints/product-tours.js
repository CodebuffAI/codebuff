"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.elementIsVisible = exports.getElementPath = exports.findElement = void 0;
var product_tours_1 = require("../extensions/product-tours");
var globals_1 = require("../utils/globals");
globals_1.assignableWindow.__PosthogExtensions__ = globals_1.assignableWindow.__PosthogExtensions__ || {};
globals_1.assignableWindow.__PosthogExtensions__.generateProductTours = product_tours_1.generateProductTours;
var element_inference_1 = require("../extensions/product-tours/element-inference");
Object.defineProperty(exports, "findElement", { enumerable: true, get: function () { return element_inference_1.findElement; } });
Object.defineProperty(exports, "getElementPath", { enumerable: true, get: function () { return element_inference_1.getElementPath; } });
Object.defineProperty(exports, "elementIsVisible", { enumerable: true, get: function () { return element_inference_1.elementIsVisible; } });
exports.default = product_tours_1.generateProductTours;
//# sourceMappingURL=product-tours.js.map