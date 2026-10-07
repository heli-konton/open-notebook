/* Local visual/interaction acceptance with explicitly mocked API fixtures.
 * No backend state is read or written. Uses the repository's test_speech.mp3.
 * Run against a local dev server. Supply PLAYWRIGHT_MODULE/CHROME_BIN if needed.
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const origin = process.env.VERIFY_ORIGIN || 'http://127.0.0.1:3014'
const output = process.env.VERIFY_OUTPUT || path.resolve(process.cwd(),'test-results/library-visual')
const profile = { id:'episode_profile:fixture', name:'Research briefing', description:'Verification fixture', speaker_config:null, default_briefing:'', num_segments:3, outline_llm:'model:fixture', transcript_llm:'model:fixture' }
const episodes = [
  {id:'episode:fixture1', name:'Understanding local-first knowledge', folder_id:'folder:research', job_status:'completed'},
  {id:'episode:fixture2', name:'Designing a personal research library', folder_id:'folder:research', job_status:'completed'},
  {id:'episode:fixture3', name:'Notes from the reading desk', job_status:'completed'},
  {id:'episode:queued', name:'Queued verification episode', job_status:'pending'},
].map(entry => ({...entry, episode_profile:profile, speaker_profile:{id:'speaker:fixture',name:'Research voices',description:'',speakers:[]}, briefing:'Verification fixture', audio_url:entry.job_status === 'completed' ? `/api/podcasts/episodes/${entry.id}/audio` : null, created:'2026-10-01T12:00:00Z'}))
const notebooks = [
  {id:'notebook:fixture1',name:'Local-first systems',folder_id:'folder:research',description:'Private knowledge, connected ideas'},
  {id:'notebook:fixture2',name:'Design research',folder_id:'folder:research',description:'Notes on useful interfaces'},
  {id:'notebook:fixture3',name:'Reading desk',description:'Unfiled research'},
].map(entry=>({...entry,archived:false,created:'2026-10-01T12:00:00Z',updated:'2026-10-01T12:00:00Z',source_count:3,note_count:2}))
async function main() {
  fs.mkdirSync(output,{recursive:true})
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_BIN || undefined,args:['--no-sandbox']})
  const results = []
  try {
    for (const viewport of [{width:1440,height:1000},{width:430,height:932},{width:320,height:740}]) {
      const context = await browser.newContext({viewport,reducedMotion:'reduce'})
      await context.addInitScript(() => {
        localStorage.setItem('auth-storage',JSON.stringify({state:{isAuthenticated:true,token:'not-required'},version:0}))
        localStorage.setItem('i18nextLng','en-US')
      })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror',e=>{errors.push(e.message);console.error('Page error',e.message)})
      page.on('console',msg=>{if(msg.type()==='error')console.error('Console',msg.text())})
      await page.route('**/config',route=>route.fulfill({json:route.request().url().includes('/api/') ? {version:'verification',dbStatus:'online',hasUpdate:false} : {apiUrl:origin}}))
      await page.route('**/api/**', async route=> {
        const url = new URL(route.request().url()); const pathname = url.pathname
        let data = []
        if (pathname === '/api/config') data = {version:'verification',dbStatus:'online',hasUpdate:false}
        else if (pathname === '/api/auth/status') data = {auth_enabled:false}
        else if (pathname === '/api/folders') data = [{id:'folder:research',name:'Research',kind:url.searchParams.get('kind') || 'notebook'}]
        else if (pathname === '/api/podcasts/episodes') data = episodes
        else if (pathname.endsWith('/audio')) return route.fulfill({contentType:'audio/mpeg',body:fs.readFileSync(path.resolve(__dirname,'../../open_notebook/ai/assets/test_speech.mp3'))})
        else if (pathname === '/api/episode-profiles') data = [profile]
        else if (pathname === '/api/notebooks') data = url.searchParams.get('archived') === 'true' ? [{...notebooks[0],id:'notebook:archived',name:'Archived research',archived:true}] : notebooks
        else if (pathname.includes('credentials/status')) data = {encryption_configured:true,source:{}}
        else if (pathname.includes('credentials/env-status')) data = {}
        return route.fulfill({json:data})
      })
      await page.goto(origin+'/podcasts')
      await page.waitForLoadState('networkidle')
      await page.locator('.episode-card').first().waitFor({state:'visible'}).catch(async error=>{console.error('Failed body',await page.locator('body').innerText());throw error})
      await page.getByText(episodes[0].name,{exact:true}).waitFor()
      assert.equal(await page.getByText('Queued verification episode',{exact:true}).count(),0)
      assert.equal(await page.locator('.collection-layout .folder-panel').count(),0)
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false)
      await page.screenshot({path:path.join(output,`podcasts-${viewport.width}.png`)})
      await page.getByRole('button',{name:'Play',exact:true}).first().click()
      await page.waitForFunction(()=>document.querySelector('audio')?.duration > 0)
      await page.waitForFunction(()=>!document.querySelector('audio')?.paused)
      const bar = await page.locator('.podcast-player').boundingBox()
      assert(bar.height < 120,`Transport height ${bar.height}`)
      const playback = await page.locator('.podcast-player button[aria-label="Pause"]').boundingBox()
      assert(playback.height >= 44 && playback.width >= 44)
      await page.screenshot({path:path.join(output,`mini-player-${viewport.width}.png`)})
      const trigger = page.getByRole('button',{name:'Expand player',exact:true})
      await trigger.click()
      const dialog = page.getByRole('dialog')
      await dialog.waitFor()
      assert.equal(await page.locator('audio').count(),1)
      const sheet = await dialog.boundingBox()
      assert(sheet.x >= 0 && sheet.x+sheet.width <= viewport.width+1)
      assert(sheet.y >= 0 && sheet.y+sheet.height <= viewport.height+1)
      if (viewport.width < 768) {
        for (const button of await dialog.getByRole('button').all()) {
          const bounds = await button.boundingBox()
          assert(bounds.width >= 44 && bounds.height >= 44,`Sheet touch target ${await button.getAttribute('aria-label') || await button.innerText()}: ${bounds.width}×${bounds.height}`)
        }
      }
      await page.screenshot({path:path.join(output,`now-playing-${viewport.width}.png`)})
      await dialog.getByRole('button',{name:'Rewind 15 seconds'}).click()
      await dialog.getByRole('button',{name:'Stop and reset'}).click()
      assert.equal(await page.locator('audio').evaluate(a=>a.currentTime),0)
      await dialog.getByRole('button',{name:'Back to library'}).click()
      await dialog.waitFor({state:'hidden'})
      assert.equal(await trigger.evaluate(el=>el===document.activeElement),true)
      await page.goto(origin+'/notebooks')
      await page.getByText(notebooks[0].name,{exact:true}).waitFor()
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false)
      await page.screenshot({path:path.join(output,`notebooks-${viewport.width}.png`)})
      await page.getByRole('button',{name:'Research 2',exact:true}).click()
      assert.equal(await page.getByText(notebooks[0].name,{exact:true}).count(),0)
      await page.getByRole('button',{name:/Archived Notebooks/}).click()
      await page.getByText('Archived research',{exact:true}).waitFor()
      assert.deepEqual(errors,[])
      results.push({viewport,transportHeight:bar.height,decodedFixtureAudio:true,focusRestored:true,noHorizontalOverflow:true,pageErrors:errors})
      await context.close()
    }
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2))
    console.log(JSON.stringify({browser:browser.version(),results,output},null,2))
  } finally { await browser.close() }
}
main().catch(error=>{console.error(error);process.exit(1)})
