const fs = require('fs-extra');
var path = require('path');
var parser = require('./comm/parser');
const mustache = require('mustache');
const util = require('./comm/util');
const pretty = require('./comm/pretty');

/**
 * 
 * @param {string} docSetRoot 
 * @param {string} lang  
 */
const write = async function (docSetRoot, projRoot, lang) {
  console.log('CSSG write document start:\n----------------- ')

  // 全局配置文件
  var globalConfigFile = 'g.json'

  if (!fs.existsSync(globalConfigFile)) {
    console.warn('Global Config Not Found.')
    return
  }

  const global = JSON.parse(fs.readFileSync(globalConfigFile))

  const pl = path.join('conf', lang + '.json')
  if (!fs.existsSync(pl)) {
    console.warn(`Error: Unrecognize language:  ${lang}`)
    return
  }
  const plConf = JSON.parse(fs.readFileSync(pl));
  const config = Object.assign(global, plConf)
  console.log('CSSG Compiler load config :', config)

  const docTemplateRoot = 'resources'
  const caseRoot = path.join(projRoot, config.caseRelativePath)

  // do write snippet back to doc
  await writeDocuments(docTemplateRoot, caseRoot, docSetRoot, config)

  console.log('CSSG write document end:\n----------------- ')

}

const writeDocuments = async function (docTemplateRoot, caseRoot, docSetRoot, config) {
  // source file extension
  const extension = config.sourceExtension

  // comment delimiter
  const delimiter = config.commentDelimiter || global.commentDelimiter
  parser.setCommentDelimiter(delimiter)

  // 代码块名称通用前缀
  const snippetNameCommonPrefix = config.snippetNameCommonPrefix

  // 抽取代码段
  const snippetMap = {}
  const sourceFiles = util.traverseFiles(caseRoot, extension)
  for (var i in sourceFiles) {
    const subSnippets = await parser.getSnippetsFromCase(sourceFiles[i])
    for (var j in subSnippets) {
      const snippet = subSnippets[j]
      if (snippetNameCommonPrefix) {
        // 添加前缀
        snippet.name = snippetNameCommonPrefix + snippet.name
      }
      snippet.bodyBlock = pretty.prettyCodeBlock(snippet.bodyBlock, 0)

      snippetMap[snippet.name] = snippet
      snippet.group = path.basename(sourceFiles[i])
    }
  }

  const tempDocDir = path.join(process.cwd(), ".temp")
  if (fs.existsSync(tempDocDir)) {
    fs.removeSync(tempDocDir)
  }
  fs.mkdirSync(tempDocDir, { recursive: true })
  await util.copyDirectory(docTemplateRoot, tempDocDir);

  const docs = util.traverseFiles(tempDocDir, "md")
  const changes = []
  for (var i in docs) {
    const newDoc = await parser.injectCodeSnippet2Doc(docs[i], function (snippetName) {
      if (snippetMap.hasOwnProperty(snippetName)) {
        return snippetMap[snippetName].bodyBlock
      }
      return null
    }, function(cssgUrl) {
      if (cssgUrl == 'api-doc') {
        return config.apiDocURL
      } else if (cssgUrl.startsWith('code-example')) {
        const name = cssgUrl.replace('code-example/', '')
        if (snippetMap[name]) {
          return config.repoUrl + '/tree/master/' + config.caseRelativePath + '/' + snippetMap[name].group
        }
      }
      return null
    })
    changes.push(newDoc)
    console.log('write doc done :', newDoc)
  }

  for (var i in changes) {
    const relativePath = changes[i].replace(tempDocDir, '')
    const dest = path.join(docSetRoot, relativePath)
    fs.copyFileSync(changes[i], dest)
    console.log('copy doc done :', dest)
  }

  fs.removeSync(tempDocDir)
}

module.exports = {
  write
}

const docRootSet = "/Users/wjielai/Workspace/cssg-cases/docRepo/product/存储与CDN/对象存储 4.0/SDK文档/Android SDK"
const lang = "android"
const projRoot = "/Users/wjielai/Workspace/qcloud-sdk-android/"
write(docRootSet, projRoot, lang)