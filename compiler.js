var fs = require('fs');
var path = require('path');
var parser = require('./comm/parser');
const mustache = require('mustache');
const util = require('./comm/util');

const isInitMethod = function (snippet) {
  return snippet.name.startsWith('global-init')
}

const genSnippet = function (snippet, macro, dynamicDefine, template, snippetsRoot) {
  const value = Object.assign({}, macro, dynamicDefine)

  const snippetBody = mustache.render(snippet.bodyBlock, value)
  const snippetContent = isInitMethod(snippet) ? snippetBody : mustache.render(template, 
    Object.assign({
      "bodyBlock": snippetBody
    }, value))

  const snippetDoc = util.getSnippetFile(snippetsRoot, snippet.name)
  util.saveFile(snippetDoc, snippetContent)

  console.log('generate snippet :', snippetDoc)
}

const genTestCase = function (snippet, macro, dynamicDefine, snippetTpl, testcaseTpl, ext, 
  testCaseRoot) {
  const camelCaseName = getCamelCaseName(snippet.name)
  const value = Object.assign({}, macro, dynamicDefine)

  const snippetBody = mustache.render(snippet.bodyBlock, value)
  const snippetContent = isInitMethod(snippet) ? snippetBody : mustache.render(snippetTpl, 
    Object.assign({
      "bodyBlock": snippetBody
    }, value))
  const testCaseContent = mustache.render(testcaseTpl, Object.assign({
    "name": camelCaseName,
    "snippet": snippetContent
  }, value))

  const testCaseFile = path.join(testCaseRoot, camelCaseName + ext)
  util.saveFile(testCaseFile, testCaseContent)
  
  console.log('generate test case :', testCaseFile)
}

const genGroupTestCase = function (groupName, snippets, macro, dynamicDefine, snippetTpl, 
  testcaseGroupTpl, ext, testCaseRoot) {
  const camelCaseName = getCamelCaseName(groupName)
  const value = Object.assign({}, macro, dynamicDefine)

  const steps = []
  for (let i in snippets) {
    const snippet = snippets[i]
    const value = Object.assign({}, macro, dynamicDefine[snippet.name] || {})
    const snippetBody = mustache.render(snippet.bodyBlock, value)
    const snippetContent = mustache.render(snippetTpl, 
      Object.assign({
        "bodyBlock": snippetBody
      }, value))
    steps.push({
      name: getCamelCaseName(snippet.name),
      snippet: snippetContent
    })
  }

  const testCaseContent = mustache.render(testcaseGroupTpl, Object.assign({
    "name": camelCaseName,
    "steps": steps
  }, value))

  const testCaseFile = path.join(testCaseRoot, camelCaseName + ext)
  util.saveFile(testCaseFile, testCaseContent)
  
  console.log('generate test case :', testCaseFile)
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
  // load project config
  const config = util.loadEntryConfig(projRoot, 'cssg.json')
  // load global config
  const global = util.loadEntryConfig(path.join(projRoot, '..'), 'g.json')

  // snippets file destination dir
  const snippetsRoot = util.getSnippetsRoot(projRoot)
  // test case destination dir
  const testCaseRoot = path.join(projRoot, 'dist')

  // source file extension
  const extension = config['sourceExtension']
  // Assembly source file root
  const sourcesRoot = path.join(projRoot, config['sourcesRoot'])

  // macro defines
  const macro4doc = util.applyBaseConfig(config['macro4doc'], global.macro4doc)
  const macro4test = util.applyBaseConfig(config['macro4test'], global.macro4test)
  const dynamicDefine = config['dynamic'] || {}

  // template defines
  var snippetTpl = path.join(projRoot, config['snippetTemplate'])
  var testcaseTpl = path.join(projRoot, config['testcaseTemplate'])
  var testcaseGroupTpl = path.join(projRoot, config['testcaseGroupTemplate'])
  var testcaseTopClsTpl = null

  snippetTpl = util.loadFileContent(snippetTpl)
  testcaseTpl = util.loadFileContent(testcaseTpl)
  testcaseGroupTpl = util.loadFileContent(testcaseGroupTpl)

  mustache.parse(snippetTpl)
  mustache.parse(testcaseTpl)
  mustache.parse(testcaseGroupTpl)
  if (config['testcaseTopClsTemplate']) {
    testcaseTopClsTpl = path.join(projRoot, config['testcaseTopClsTemplate'])
    testcaseTopClsTpl = util.loadFileContent(testcaseTopClsTpl)
    mustache.parse(testcaseTopClsTpl)
  }

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
      const d = dynamicDefine[snippet.name] || {}
      mustache.parse(snippet.bodyBlock)  
      genSnippet(snippet, macro4doc, d, snippetTpl, snippetsRoot)

      snippetNameDic[snippet.name] = snippet
    }
  }

  // generate group test case
  const groups = global.group
  const added = []
  for (var groupName in groups) {
    if (groups.hasOwnProperty(groupName)) {
      const group = groups[groupName]
      const gs = []
      for (var i in group) {
        if (snippetNameDic.hasOwnProperty(group[i])) {
          gs.push(snippetNameDic[group[i]])
          added.push([group[i]])
        }
      }

      genGroupTestCase(groupName, gs, macro4test, dynamicDefine, snippetTpl, 
        testcaseGroupTpl, extension, testCaseRoot)
    }
  }
  for (var i in added) {
    delete snippetNameDic[added[i]]
  }
  // generate single test case
  for (var name in snippetNameDic) {
    if (snippetNameDic.hasOwnProperty(name)) {
      const snippet = snippetNameDic[name]
      const d = dynamicDefine[snippet.name] || {}

      var caseTpl = testcaseTpl
      if (snippet.name.endsWith('topcls') && testcaseTopClsTpl) {
        caseTpl = testcaseTopClsTpl
      }
      genTestCase(snippet, macro4test, d, snippetTpl, caseTpl, extension, 
        testCaseRoot)
    }
  }
}

module.exports = {
  compile
}




