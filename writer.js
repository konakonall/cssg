const fs = require('fs-extra');
var path = require('path');
var parser = require('./comm/parser');
const mustache = require('mustache');
const util = require('./comm/util');
const pretty = require('./comm/pretty');
const git = require('./comm/git')

const write = async function (projRoot, docSetSpecifiedRoot) {
  console.log('CSSG write start:\n----------------- ')

  // load global config
  var globalConfigFile = path.join(projRoot, 'g.json')
  var writeAll
  var docSetRoot

  if (!fs.existsSync(globalConfigFile)) {
    globalConfigFile = path.join(projRoot, '../g.json')
    writeAll = false
    docSetRoot = path.join(projRoot, '../docRepo')
  } else {
    writeAll = true
    docSetRoot = path.join(projRoot, 'docRepo')
  }

  if (!fs.existsSync(globalConfigFile)) {
    console.warn('Global Config Not Found.')
    return
  }

  const global = JSON.parse(fs.readFileSync(globalConfigFile))

  // sync documents
  if (docSetSpecifiedRoot == null) {
    console.info('Sync Docs from Remote.')
    await git.syncRemoteRepo(global.docSetRemoteGitUrl, docSetRoot)
  } else {
    docSetRoot = docSetSpecifiedRoot
  }

  const sdkDocSetRoot = path.join(docSetRoot, global.sdkDocSetRelativePath)

  const projs = []
  if (writeAll) {
    var list = fs.readdirSync(projRoot)
    list.forEach(function(file) {
        file = path.resolve(projRoot, file)
        var stat = fs.statSync(file)
        if (stat && stat.isDirectory()) {
          projs.push(file)
        }
    })
  } else {
    projs.push(projRoot)
  }

  // do write snippet back to doc
  for (var i in projs) {
    await writeSnippetBack(projs[i], sdkDocSetRoot, global)
  }

  console.log('CSSG write end:\n----------------- ')

}

const writeSnippetBack = async function (projRoot, sdkDocSetRoot, global) {
  // load project config
  var configFile = path.join(projRoot, 'cssg.json')
  if (!fs.existsSync(configFile)) {
    console.log(`Cann't find cssg.json in ${projRoot}`)
    return null
  }

  const config = util.loadEntryConfig(projRoot, 'cssg.json')
  
  // document file relative path
  const docRoot = config.docRoot
  if (!config.docRoot) {
    console.warn(`Please set \"docRoot\" in ${configFile}.`)
    return null
  }
  // document set directory
  const targetDocSetDir = path.join(sdkDocSetRoot, docRoot)

  // test case destination dir
  const testCaseRoot = path.join(projRoot, config.compileDist || global.compileDist)
  // source file extension
  const extension = config.sourceExtension
  
  // macro defines
  config.macro4doc = config.macro4doc || {}
  config.macro4test = config.macro4test || {}
  config.macro4doc.language = config.language
  config.macro4test.language = config.language
  const macro4doc = util.applyBaseConfig(config.macro4doc, global.macro4doc)
  const macro4test = util.applyBaseConfig(config.macro4test, global.macro4test)
  delete macro4doc.language
  delete macro4test.language

  // comment delimiter
  const delimiter = config.commentDelimiter || global.commentDelimiter
  parser.setCommentDelimiter(delimiter)

  // lookup Documents
  const testCases = util.traverseFiles(testCaseRoot, extension)
  // 代码块名称通用前缀
  const snippetNameCommonPrefix = config.snippetNameCommonPrefix

  // 抽取代码段
  const snippetMap = {}
  for (var i in testCases) {
    const subSnippets = await parser.getSnippetsFromCase(testCases[i])
    for (var j in subSnippets) {
      const snippet = subSnippets[j]
      if (snippetNameCommonPrefix) {
        // 添加前缀
        snippet.name = snippetNameCommonPrefix + snippet.name
      }

      //  代码段处理
      // 1. 替换变量值
      // 2. 去掉测试用的表达式，如断言
      processSnippetBody(snippet, macro4doc, macro4test, config.beforeRun)

      snippetMap[snippet.name] = snippet
    }
  }

  const docs = util.traverseFiles(targetDocSetDir, "md")
  const changes = []
  for (var i in docs) {
    const newDoc = await parser.injectCodeSnippet2Doc(docs[i], function (snippetName) {
      if (snippetMap.hasOwnProperty(snippetName)) {
        return snippetMap[snippetName].bodyBlock
      }
      return null
    })
    changes.push(newDoc)
    console.log('write doc done :', newDoc)
  }

}

const processSnippetBody = function (snippet, macro4doc, macro4test, beforeRun) {
  var body = snippet.bodyBlock

  const lines = util.splitLines(body)
  for(var i = lines.length - 1; i>=0; i--) {
    if (lines[i].trim().length < 1) {
      lines.pop()
    } else {
      break
    }
  }
  const lineBuffer = []

  for (const i in lines) {
    var lineCode = lines[i]
    // 替换变量值
    for (const key in macro4test) {
      if (macro4test[key]) {
        while (lineCode.indexOf(macro4test[key]) != -1) {
          lineCode = lineCode.replace(macro4test[key], macro4doc[key]);
          if (macro4doc[key].includes(macro4test[key])) {
            break
          }
        }
      }
    }

    // 去掉测试用的表达式
    var skip = false
    if (beforeRun) {
      const insertExps = beforeRun.insert
      if (insertExps) {
        for (var j in insertExps) {
          const insertExp = insertExps[j]
          if (lineCode.trim() == insertExp.expression) {
            skip = true
            break
          }
        }
      }
    }

    if (!skip) {
      lineBuffer.push(lineCode)
    }
  }

  body = lineBuffer.join(util.LINE_BREAKER)

  snippet.bodyBlock = pretty.prettyCodeBlock(body, 0)
}

const addCommit = async function (gitRepo, changes) {
  changes = changes || {}
  if (!changes.language) {
    return
  }

  return new Promise((resolve, reject) => {
    gitRepo.diffSummary((error, summary) => {
      if (summary && summary.files && summary.files.length > 0) {
        gitRepo.add(changes.sdkDocDir)
        const message = `Update COS ${changes.language} sdk doc ${new Date().toISOString()}`
        // gitRepo.commit(message)
        console.log("Add 1 commit :", message)
      } else {
        console.log("No changes Applied")
      }
      gitRepo.exec(() => {
        resolve(1)
      })
    })
  })
}

module.exports = {
  write
}

// write(path.join(__dirname, '../cssg-cases/Javascript'), 
// '/Users/wjielai/Workspace/cssg-cases/docRepo')