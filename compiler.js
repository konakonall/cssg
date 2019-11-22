var fs = require('fs');
var path = require('path');
var parser = require('./comm/parser');
const mustache = require('mustache');
const util = require('./comm/util');
const pretty = require('./comm/pretty');

const isInitMethod = function (snippet) {
  return snippet.name.startsWith('global-init')
}

const templateIndentation = {}

const genSnippet = function (snippet, macro, dynamicDefine, template, 
  ignoreExpression4Snippet, snippetsRoot) {
  let snippetContent = renderSnippetContent(snippet, macro, dynamicDefine, template)

  // remote ignore expression in code block
  for (const i in ignoreExpression4Snippet) {
    const exp = ignoreExpression4Snippet[i]
    snippetContent = snippetContent.replace(new RegExp(exp, 'g'), "")
  }

  const snippetDoc = util.getSnippetFile(snippetsRoot, snippet.name)
  util.saveFile(snippetDoc, snippetContent)

  console.log('generate snippet :', snippetDoc)
}

const genTestCase = function (pipeline, macro, dynamicDefine, snippetTpl, 
  testcaseTpl, ext, testCaseRoot) {
  const camelCaseName = getCamelCaseName(pipeline.name)

  // figure out code block indentation
  var indentation = templateIndentation[testcaseTpl]
  if (!indentation) {
    indentation = getSnippetIndentation(testcaseTpl)
    templateIndentation[testcaseTpl] = indentation
  }

  const steps = []
  for (let i in pipeline.steps) {
    const snippet = pipeline.steps[i]
    const snippetContent = renderSnippetContent(snippet, macro, dynamicDefine[snippet.name], 
      snippetTpl, indentation)
    steps.push({
      name: getCamelCaseName(snippet.name),
      snippet: snippetContent
    })
  }
  var setupBlock, teardownBlock
  if (pipeline.setup) {
    setupBlock = renderSnippetContent(pipeline.setup, macro, dynamicDefine[pipeline.setup.name],
      snippetTpl, indentation)
  }
  if (pipeline.teardown) {
    teardownBlock = renderSnippetContent(pipeline.teardown, macro, dynamicDefine[pipeline.teardown.name],
      snippetTpl, indentation)
  }

  const testCaseContent = mustache.render(testcaseTpl, {
    "name": camelCaseName,
    "steps": steps,
    "setupBlock": setupBlock,
    "teardownBlock": teardownBlock
  })

  const testCaseFile = path.join(testCaseRoot, camelCaseName + ext)
  util.saveFile(testCaseFile, testCaseContent)
  
  console.log('generate test case :', testCaseFile)
}

function getSnippetIndentation(testcaseTpl) {
  const lines = testcaseTpl.split(/(?:\r\n|\r|\n)/g)
  for (const i in lines) {
    const lineCode = lines[i]
    const matcher = lineCode.match("(\\s*){{2,3}snippet}{2,3}\\s*")
    if (matcher) {
      return matcher[1].length
    }
  }
}

function renderSnippetContent(snippet, macro, dynamicDefine, snippetTpl, indentation) {
  const value = Object.assign({}, macro, dynamicDefine || {})
  var snippetBody = mustache.render(snippet.bodyBlock, value)
  snippetBody = pretty.prettyCodeBlock(snippetBody, 0)
  var snippetContent = isInitMethod(snippet) ? snippetBody : mustache.render(snippetTpl, 
    Object.assign({
      "bodyBlock": snippetBody
    }, value))
  if (indentation > 0) {
    snippetContent = pretty.prettyCodeBlock(snippetContent, indentation)
  }
  return snippetContent
}

const getCamelCaseName = function (name) {
  const array = name.split('-')
  var camelCaseName = ''
  for (var i in array) {
    camelCaseName = camelCaseName.concat(array[i].charAt(0).toUpperCase()
       + array[i].substring(1))
  }
  return camelCaseName
}

const compile = async function(projRoot) {
  console.log('CSSG compile start:\r\n----------------- ')
  // load project config
  const config = util.loadEntryConfig(projRoot, 'cssg.json')
  // load global config
  const global = util.loadEntryConfig(path.join(projRoot, '..'), 'g.json')

  // snippets file destination dir
  const snippetsRoot = util.getSnippetsRoot(projRoot)
  // test case destination dir
  const testCaseRoot = path.join(projRoot, 'dist')

  // source file extension
  const extension = config.sourceExtension
  // Assembly source file root
  const sourcesRoot = path.join(projRoot, config.sourcesRoot)

  // macro defines
  const macro4doc = util.applyBaseConfig(config.macro4doc, global.macro4doc)
  const macro4test = util.applyBaseConfig(config.macro4test, global.macro4test)
  const dynamicDefine = config.dynamic || {}

  // template defines
  var snippetTpl = path.join(projRoot, config.snippetTemplate)
  var testcaseTpl = path.join(projRoot, config.testcaseTemplate)
  const exclusiveTemplate = config.exclusiveTemplate || {}

  snippetTpl = util.loadFileContent(snippetTpl)
  testcaseTpl = util.loadFileContent(testcaseTpl)

  mustache.parse(snippetTpl)
  mustache.parse(testcaseTpl)

  // load ignore expression
  const ignoreExpression4Snippet = config.ignoreExpressionInDoc || []

  // create destination dir if necessary
  if (!fs.existsSync(snippetsRoot)) {
    fs.mkdirSync(snippetsRoot, { recursive: true })
  }
  if (!fs.existsSync(testCaseRoot)) {
    fs.mkdirSync(testCaseRoot, { recursive: true })
  }

  // lookup Assembly file
  const sources = util.traverseFiles(sourcesRoot, extension)
  // get all snippets
  const snippets = []
  for (var i in sources) {
    const subSnippets = await parser.parseSnippetBody(sources[i])
    Array.prototype.push.apply(snippets, subSnippets)
  }
  // generate snippet file
  const snippetNameDic = {}
  for (var i in snippets) {
    const snippet = snippets[i]
    if (snippet.name) {
      mustache.parse(snippet.bodyBlock)
      genSnippet(snippet, macro4doc, dynamicDefine, snippetTpl, 
        ignoreExpression4Snippet, snippetsRoot)

      snippetNameDic[snippet.name] = snippet
    }
  }

  // generate test case by group
  const groups = global.group
  const added = []
  for (var groupName in groups) {
    if (groups.hasOwnProperty(groupName)) {
      const group = groups[groupName]

      const pipeline = {}
      const steps = Array.isArray(group) ? group : group.steps
      const gs = []
      for (var i in steps) {
        if (snippetNameDic.hasOwnProperty(steps[i])) {
          gs.push(snippetNameDic[steps[i]])
          added.push([steps[i]])
        }
      }
      pipeline.name = groupName
      pipeline.steps = gs
      if (!Array.isArray(group)) {
        if (snippetNameDic.hasOwnProperty(group.setup)) {
          pipeline.setup = snippetNameDic[group.setup]
          added.push(group.setup)
        }
        if (snippetNameDic.hasOwnProperty(group.teardown)) {
          pipeline.teardown = snippetNameDic[group.teardown]
          added.push(group.teardown)
        }
      }

      var tpl = testcaseTpl
      if (exclusiveTemplate[groupName]) {
        tpl = path.join(projRoot, exclusiveTemplate[groupName])
        tpl = util.loadFileContent(tpl)
      }

      genTestCase(pipeline, macro4test, dynamicDefine, snippetTpl, tpl, extension, 
        testCaseRoot)
    }
  }
  for (var i in added) {
    delete snippetNameDic[added[i]]
  }
  // generate remain test case
  for (var name in snippetNameDic) {
    if (snippetNameDic.hasOwnProperty(name)) {
      const snippet = snippetNameDic[name]

      var tpl = testcaseTpl
      if (exclusiveTemplate[snippet.name]) {
        tpl = path.join(projRoot, exclusiveTemplate[snippet.name])
        tpl = util.loadFileContent(tpl)
      }
      const pipeline = {
        "steps": [snippet],
        "name": snippet.name 
      }
      genTestCase(pipeline, macro4test, dynamicDefine, snippetTpl, tpl, extension, 
        testCaseRoot)
    }
  }

  console.log('----------------- \r\nCSSG compile end.')

}

module.exports = {
  compile
}

compile(path.join(__dirname, '../cssg-cases/dotnet'))

// const content = util.loadFileContent(path.join(__dirname, 
//   '../cssg-cases/dotnet/snippets/abort-multi-upload.snippet'))
// console.log(pretty.prettyCodeBlock(content, 0))
