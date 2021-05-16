/**
 * Copyright (C) 2014-2015 KO GmbH <copyright@kogmbh.com>
 *
 * @licstart
 * This file is part of WebODF.
 *
 * WebODF is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License (GNU AGPL)
 * as published by the Free Software Foundation, either version 3 of
 * the License, or (at your option) any later version.
 *
 * WebODF is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with WebODF.  If not, see <http://www.gnu.org/licenses/>.
 * @licend
 *
 * @source: http://www.webodf.org/
 * @source: https://github.com/kogmbh/WebODF/
 */

/*global define, window, NodeFilter, ops, runtime*/

define("webodf/editor/plugins/bella/DocumentValidator", function() {
    "use strict";
    var webodf = window; // WebODF doesn't support AMD yet...

    /**
     * @constructor
     * @param {!gui.SessionController} controllers
     * @param {!number} lengthCheckCount Check document length 1 in lengthCheckCount verify calls
     */
    function DocumentValidator(controllers, lengthCheckCount) {
        var session = controllers.getSession(),
            odtDocument = session.getOdtDocument(),
            dom = odtDocument.getDOMDocument(),
            canvasElement = odtDocument.getOdfCanvas().getElement(),
            textNodeWalker,
            lastRoot,
            verifyCallCount = 0,
            predictedDocumentLength = 0;

        function emptyNodes(node) {
            if (node.length === 0 &&
                node.parentNode !== controllers.getEventManager().getEventTrap()) {
                return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_REJECT;
        }

        function ensureNoEmptyTextNodes() {
            var node;
            textNodeWalker.currentNode = canvasElement;
            node = textNodeWalker.nextNode();
            webodf.runtime.assert(Boolean(node) === false, "Empty text nodes were found");
        }

        function ensureCursorsOnStep() {
            var root = odtDocument.getRootNode(),
                stepIterator = odtDocument.createStepIterator(root, 0, [odtDocument.getPositionFilter()], root);

            // In a Bella environment each memberid has a cursor
            odtDocument.getMemberIds().forEach(function (memberId) {
                var cursor = odtDocument.getCursor(memberId);
                stepIterator.setPosition(cursor.getNode(), 0);
                webodf.runtime.assert(stepIterator.isStep(), "Cursor focus for '" + memberId + "' in non-step position");
                if (cursor.getAnchorNode() !== cursor.getNode()) {
                    stepIterator.setPosition(cursor.getAnchorNode(), 0);
                    webodf.runtime.assert(stepIterator.isStep(), "Cursor anchor for '" + memberId + "' in non-step position");
                }
            });
        }

        function getDocumentLength() {
            // A clean cache is used to avoid repairing the current OdtDocument one.
            // This is an attempt to minimise the impact document validation has on the live state.
            var rootNode = odtDocument.getRootNode(),
                cleanCache = new ops.OdtStepsTranslator(rootNode,
                    odtDocument.createPositionIterator(rootNode),
                    odtDocument.getPositionFilter(), 500),
                documentRoot = odtDocument.getRootNode();

            return cleanCache.convertDomPointToSteps(documentRoot, documentRoot.childNodes.length);
        }

        function ensureDocumentLengthIsCorrect(opspec) {
            var documentRoot = odtDocument.getRootNode(),
                cleanLength,
                optype = (opspec && opspec.optype) || "no-op";

            if (documentRoot !== lastRoot) {
                // An undo has been detected
                lastRoot = documentRoot;
                predictedDocumentLength = getDocumentLength();
            } else if (predictedDocumentLength !== undefined) {
                switch (optype) {
                    case "InsertText":
                        predictedDocumentLength += opspec.text.length;
                        break;
                    case "SplitParagraph":
                        predictedDocumentLength += 1;
                        break;
                    case "MergeParagraph":
                        predictedDocumentLength -= 1;
                        break;
                    case "AddAnnotation":
                        predictedDocumentLength += 2;
                        break;
                    case "RemoveAnnotation":
                        // Don't have any easy way to tell how much data was added or removed here
                        predictedDocumentLength = undefined;
                        break;
                    case "RemoveText":
                        // Don't have any easy way to tell how much data was added or removed here
                        predictedDocumentLength = undefined;
                        break;
                    // TODO add other items that modify document content
                    default:
                        break;
                }
            }

            if (verifyCallCount % lengthCheckCount === 0 && predictedDocumentLength !== undefined) {
                cleanLength = getDocumentLength();
                webodf.runtime.assert(predictedDocumentLength === cleanLength, "Unexpected document length change during " +
                    optype + " from " + predictedDocumentLength + " to " + cleanLength);
            }

        }

        function ensureCursorWithinSameRoot() {
            odtDocument.getMemberIds().forEach(function(memberId) {
                var cursor = odtDocument.getCursor(memberId),
                    anchorRoot = odtDocument.getRootElement(cursor.getAnchorNode()),
                    cursorRoot = odtDocument.getRootElement(cursor.getNode());

                runtime.assert(anchorRoot === cursorRoot,  "Cursor selection crosses root boundaries for " + memberId);
            });
        }

        /**
         * @return {undefined}
         */
        this.check = function (op) {
            verifyCallCount += 1;
            ensureNoEmptyTextNodes();
            ensureCursorsOnStep();
            ensureDocumentLengthIsCorrect(op && op.spec());
            ensureCursorWithinSameRoot();
        };

        function init() {
            textNodeWalker = dom.createTreeWalker(canvasElement, NodeFilter.SHOW_TEXT, emptyNodes, false);
        }

        init();
    }

    return DocumentValidator;
});
