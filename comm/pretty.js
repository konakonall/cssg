const util = require('./util')
const path = require('path')

const prettyCodeBlock = function (snippetBody, toIndentation) {
  const lines = snippetBody.split(/(?:\r\n|\r|\n)/g)

  let startIndentation = -1
  var newSnippetBody = []
  for (var i in lines) {
    const codeLine = lines[i]
    const matcher = codeLine.match('(\\s*)(.*)')
    const indentation = matcher[1].length
    var newIndentation
    if (startIndentation < 0) {
      startIndentation = indentation
      newIndentation = 0
    } else {
      newIndentation = Math.max(0, indentation - startIndentation) + toIndentation
    }
    const newLine = getIndentationString(newIndentation) + matcher[2] + 
      (i < lines.length - 1 ? util.LINE_BREAKER : '')
    
    newSnippetBody.push(newLine)
  }

  return newSnippetBody.join('')
}

const getIndentationString = function (indentation) {
  const ind = [];
  var arraySize = indentation
  while(arraySize--) ind.push(' ');

  return ind.join('')
}

module.exports = {
  prettyCodeBlock
}