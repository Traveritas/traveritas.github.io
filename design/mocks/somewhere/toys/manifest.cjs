/* 扫描 data/ 生成 manifest.js（索引页按它加载全部条目）
   node design/mocks/somewhere/toys/manifest.cjs
   加新的数据文件以后跑一次就行；索引页本身不用改。 */
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, 'data');
const OUT = path.join(__dirname, 'manifest.js');

const files = fs.existsSync(DATA)
  ? fs.readdirSync(DATA).filter((f) => /^[A-J]-\d+\.js$/.test(f)).sort()
  : [];

fs.writeFileSync(OUT, `/* 自动生成，不要手改。node toys/manifest.cjs 重跑。 */\nwindow.TOY_FILES = ${JSON.stringify(files, null, 2)};\n`);
console.log(`manifest.js · ${files.length} 个文件`);
