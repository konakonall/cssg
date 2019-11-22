const util = require('./util')
const path = require('path')

const prettyCodeBlock = function (snippetBody, toIndentation) {
  const reg = new RegExp("(\\s*)(.+)\\\r\\\n", 'g')
  var matcher

  let startIndentation = -1
  var newSnippetBody = []
  while ((matcher = reg.exec(snippetBody)) != null) {
    const indentation = matcher[1].length
    if (startIndentation < 0) {
      startIndentation = indentation
    }
    const newIndentation = indentation - startIndentation + toIndentation
    const newLine = getIndentationString(newIndentation) + matcher[2] + '\r\n'
    
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