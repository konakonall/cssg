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

  var documentRelativePath
  var tempDocDir
  // do write snippet back to doc
  if (lang.indexOf('+') > 0) {
    // 包含多个语言，需要做合并处理
    const langs = lang.split('+')
    const tempDocDirs = []
    const languageNames = []
    for (var i in langs) {
      const o = await writeDocuments(docTemplateRoot, docSetRoot, langs[i], global)
      tempDocDirs.push(o.tempDocDir)
      documentRelativePath = o.documentRelativePath
      languageNames.push(o.titleLabel)
    }
    // 合并文档
    const docs = util.traverseFiles(tempDocDirs[0], ".md")
    for (var i in docs) {
      const aDoc = docs[i]
      for (var j = 1; j < tempDocDirs.length; j++) {
        const addDoc = path.join(tempDocDirs[j], aDoc.replace(tempDocDirs[0], ''))
        parser.mergeDocsForMultiLanguage(aDoc, languageNames[0], addDoc, languageNames[j])
      }
    }
    for (var i = 1; i < tempDocDirs.length; i++) {
      fs.removeSync(tempDocDirs[i])
    }

    tempDocDir = tempDocDirs[0]
  } else {
    const o = await writeDocuments(docTemplateRoot, docSetRoot, lang, global)
    documentRelativePath = o.documentRelativePath
    tempDocDir = o.tempDocDir
  }

  // 拷贝到目标目录
  const langDocsetRoot = path.join(docSetRoot, documentRelativePath)
  const changes = util.traverseFiles(tempDocDir, ".md")
  for (var i in changes) {
    const relativePath = changes[i].replace(tempDocDir, '')
    const dest = path.join(langDocsetRoot, relativePath)
    fs.copyFileSync(changes[i], dest)
    console.log('copy doc done :', dest)
  }

  // 清理临时文件
  fs.removeSync(tempDocDir)
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
        snippet.name = snippet.name.replace(snippetNameCommonPrefix, '')
      }
      snippet.bodyBlock = pretty.prettyCodeBlock(snippet.bodyBlock, 0)

      snippetMap[snippet.name] = snippet
      snippet.group = path.basename(sourceFiles[i])
    }
  }

  const tempDocDir = path.join(process.cwd(), ".temp", 'docs', lang)
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

  return {
    tempDocDir,
    titleLabel: config.titleLabel,
    documentRelativePath: config.documentRelativePath
  }
}

module.exports = {
  write
}