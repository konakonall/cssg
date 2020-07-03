const fs = require('fs-extra');
var path = require('path');
var parser = require('./comm/parser');
const util = require('./comm/util');
const pretty = require('./comm/pretty');
const cssg = require('./cssg');

/**
 * 生成SDK文档
 * 
 * @param {string} docSetRoot 
 * @param {string} lang  
 */
const write = async function (docSetRoot, lang) {
  console.log('CSSG write document start:\n----------------- ')

  const global = await cssg.globalConfig()

  if (!global) {
    console.warn('Global Config Not Found.')
    return
  }

  // 准备 CSSG 本地仓库
  const localRepo = await cssg.prepareLocalRepo()
  const docTemplateRoot = path.join(localRepo.home, 'resources')

  // do write snippet back to doc
  await writeDocuments(docTemplateRoot, docSetRoot, lang, global)

  if (localRepo.temp) {
    fs.removeSync(localRepo.home)
  }

  console.log('CSSG write document end:\n----------------- ')

}

const writeDocuments = async function (docTemplateRoot, 
    docSetRoot, lang, globalConfig) {
  console.log('CSSG Writer start handle:', lang)

  const plConf = await cssg.langConfig(lang)
  if (!plConf) {
    console.warn(`Error: Unrecognize language:  ${lang}`)
    return
  }

  // 准备本地代码仓库
  const localRepo = await cssg.prepareLocalLanguageRepo(lang, plConf.repoUrl)

  const projRoot = path.join(localRepo.home, plConf.projRoot)
  const langConf = JSON.parse(util.loadFileContent(path.join(projRoot, 'cssg.json')))
  const config = Object.assign(globalConfig, plConf, langConf)
  // 最终配置
  console.log('CSSG Writer load config :', config)
  const caseRoot = path.join(projRoot, config.caseRelativePath)

  // source file extension
  const extension = config.sourceExtension

  // comment delimiter
  const delimiter = config.commentDelimiter
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

  const tempDocDir = path.join(process.cwd(), ".temp", 'docs')
  if (fs.existsSync(tempDocDir)) {
    fs.removeSync(tempDocDir)
  }
  fs.mkdirSync(tempDocDir, { recursive: true })
  await util.copyDirectory(docTemplateRoot, tempDocDir);

  const docs = util.traverseFiles(tempDocDir, config.docExtension)
  const changes = []
  for (var i in docs) {
    const newDoc = await parser.injectCodeSnippet2Doc(docs[i], config.snippetLabel, 
      function (snippetName) {
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
          return config.repoUrl + path.join('/tree/master/', config.projRoot, 
            config.caseRelativePath, snippetMap[name].group)
        }
      }
      return null
    })
    changes.push(newDoc)
    console.log('write doc done :', newDoc)
  }

  const langDocsetRoot = path.join(docSetRoot, config.documentRelativePath)
  for (var i in changes) {
    const relativePath = changes[i].replace(tempDocDir, '')
    const dest = path.join(langDocsetRoot, relativePath)
    fs.copyFileSync(changes[i], dest)
    console.log('copy doc done :', dest)
  }

  fs.removeSync(tempDocDir)
  if (localRepo.temp) {
    fs.removeSync(localRepo.home)
  }
}

module.exports = {
  write
}