const { Telegraf, Markup } = require('telegraf')
const WizardScene = require('telegraf/scenes/wizard')
const LocalSession = require('telegraf-session-local')
const Stage = require('telegraf/stage')
const { clamp, isValidTimeZone, createUrlList, sendStuff, createRecurrenceRule, createJob, createJobsList } = require('./helpers.js')

// Map that holds all the active node-schedule jobs 
const jobsList = new Map();

// creating scene for getting link from user
const getLink = new WizardScene(
    "get_link",
    // asking for link
    ctx => {
        ctx.reply("Введите ссылку на онлайн-материал, который хотите сохранить:")
        return ctx.wizard.next()
    },
    // verification and and adding link to the db, going to the previous step if verification failed
    ctx => {
        if (ctx.message.entities && ctx.message.entities[0].type === "url") {
            let url = ctx.message.text
            let domain = new URL(url)
            domain = domain.hostname
            domain = domain.replace("www.", "")

            let linkInfo = {
                text: url,
                domain: domain,
                order: 1
            }

            for (const link of ctx.session.links) {
                if (link.text === url) {
                    ctx.replyWithMarkdown(`Ссылка на этот онлайн-материал уже была сохранена. Чтобы посмотреть сохраненные материалы, введите команду \/mymaterials\.`)
                    return ctx.scene.leave()
                }
                if (link.domain === domain) {
                    linkInfo.order++
                }
            }
            ctx.session.links[ctx.session.links.length] = linkInfo
            ctx.session.isEverythinRead = false
            ctx.reply("Материал успешно добавлен ✅")

            jobsList.get(ctx.from.id).cancel()
            const rule = createRecurrenceRule(ctx.session.morningHour, ctx.session.morningMinute, ctx.session.morningTimezone)
            const job = createJob(rule, function(){
                sendStuff(bot, ctx.session.chatId, ctx.session.isEverythinRead)
            })
            jobsList.set(ctx.from.id, job)
            
            if (ctx.session.links.length%10 === 0) ctx.session.pages++
        } else {
            ctx.wizard.back()
            return ctx.wizard.steps[ctx.wizard.cursor](ctx)
        }
        
        return ctx.scene.leave()
    }
)

// creating scene for removing link received from user
const removeLink = new WizardScene(
    "remove_link",
    // asking for link
    ctx => {
        ctx.reply("Введите ссылку на онлайн-материал, который хотите удалить:")
        return ctx.wizard.next()
    },
    // verification and and removing link from the db, going to the previous step if verification failed
    ctx => {
        if (ctx.message.entities && ctx.message.entities[0].type === "url") {
            for (const link of ctx.session.links) {
                if (link.text === ctx.message.text) {
                    const index = ctx.session.links.indexOf(link)
                    ctx.session.links.splice(index, 1)
                    ctx.reply("Материал был успешно удален.")
                    return ctx.scene.leave()
                }
            }
            ctx.reply(`Данный материал не был сохранен прежде. Чтобы сохранить материал, введите команду \/newmaterial\.`)

            if (ctx.session.links.length%10 === 0) ctx.session.pages--
        } else {
            ctx.wizard.back()
            return ctx.wizard.steps[ctx.wizard.cursor](ctx)
        }
        return ctx.scene.leave()
    }
)
const setMorning = new WizardScene(
    "set_morning",
    // asking for hour
    ctx => {
        ctx.reply("Введите час в котором хотите получать уведомление:")
        return ctx.wizard.next()
    },
    // verification and and adding hour to the db, going to the previous step if verification failed
    ctx => {
        let hour = parseInt(ctx.message.text, 10)
        if (!isNaN(hour) && hour >= 0 && hour <= 23) {
            ctx.session.morningHour = hour
            ctx.wizard.next()
            return ctx.wizard.steps[ctx.wizard.cursor](ctx)
        } else {
            ctx.wizard.back()
            return ctx.wizard.steps[ctx.wizard.cursor](ctx)
        }
    },
    // asking for minute
    ctx => {
        ctx.reply("Введите минуту в которую хотите получать уведомление:")
        return ctx.wizard.next()
    },
    // verification and and adding minute to the db, going to the previous step if verification failed
    ctx => {
        let minute = parseInt(ctx.message.text, 10)
        if (!isNaN(minute) && minute >= 0 && minute <= 59) {
            ctx.session.morningMinute = minute
            ctx.wizard.next()
            return ctx.wizard.steps[ctx.wizard.cursor](ctx)
        } else {
            ctx.wizard.back()
            return ctx.wizard.steps[ctx.wizard.cursor](ctx)
        }
    },
    // asking for timezone
    ctx => {
        ctx.replyWithMarkdown("Введите выш часовой пояс ([список часовых поясов](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)):")
        return ctx.wizard.next()
    },
    // verification and and adding timezone to the db, going to the previous step if verification failed, creating and adding node-schedule jobs to the Map
    ctx => {
        let timezone = ctx.message.text
        if (isValidTimeZone(timezone)) {
            ctx.session.morningTimezone = timezone

            jobsList.get(ctx.from.id).cancel()
            const rule = createRecurrenceRule(ctx.session.morningHour, ctx.session.morningMinute, ctx.session.morningTimezone)
            const job = createJob(rule, function(){
                sendStuff(bot, ctx.session.chatId, ctx.session.isEverythinRead)
            })
            jobsList.set(ctx.from.id, job)

            return ctx.scene.leave()
        } else {
            ctx.wizard.back()
            return ctx.wizard.steps[ctx.wizard.cursor](ctx)
        }
    }
)

// setting up bot and middlewares
const stage = new Stage([getLink, removeLink, setMorning]);
const bot = new Telegraf(process.env.BOT_TOKEN)
bot.use((new LocalSession({ database: 'db.json' })).middleware())
bot.use(stage.middleware());

// creating keyboard, adding parse mode for pagination to work
const paginationKeyboard = Markup.inlineKeyboard([
    Markup.callbackButton('🔙', 'back'),
    Markup.callbackButton('⏭️', 'next'),
]).extra()
Object.assign(paginationKeyboard, { parse_mode: "HTML", disable_web_page_preview: true })




bot.start((ctx) => {
    // setting up initial state for the user's session
    ctx.session.links = []
    ctx.session.page = 1
    ctx.session.pages = 1
    ctx.session.chatId = ctx.from.id
    ctx.session.isEverythinRead = true


    ctx.session.morningHour = 8
    ctx.session.morningMinute = 0
    ctx.session.morningTimezone = "Europe/Kyiv"

    // creating initial node-schedule job and adding it to the map
    const rule = createRecurrenceRule(8, 0, "Europe/Kyiv")
    const job = createJob(rule, function(){
        sendStuff(bot, ctx.from.id, true)
    })
    jobsList.set(ctx.from.id, job)

    ctx.replyWithMarkdown("*May the Force be with you*")
    ctx.replyWithMarkdown(`Список актуальных команд:\n\n\/newmaterial\: Позволяет добавить материал в список.\n\/removematerial\: Позволяет удалить материал из списка.\n\/mymaterials\: Позволяет просмотреть список материалов.\n\/setmorning\: Позволяет установить время, в котором будет приходить серия утренних уведомлений.`)
})
bot.help((ctx) => {
    ctx.replyWithMarkdown(`Список актуальных команд:\n\n\/newmaterial\: Позволяет добавить материал в список.\n\/removematerial\: Позволяет удалить материал из списка.\n\/mymaterials\: Позволяет просмотреть список материалов.\n\/setmorning\: Позволяет установить время, в котором будет приходить серия утренних уведомлений.`)
})

// all these 3 commands are just entering predefined scenes
bot.command('newmaterial', (ctx) => {
  ctx.scene.enter('get_link')
})
bot.command("removematerial", (ctx) => {
    ctx.scene.enter("remove_link")
})
bot.command("setmorning", (ctx) => {
    ctx.scene.enter("set_morning")
})


// command creates the message with all the materials from the page the user finds on
bot.command("mymaterials", (ctx) => {
    let message = createUrlList(ctx.session.links, ctx.session.page)
    
    if (ctx.session.page === ctx.session.pages) ctx.session.isEverythinRead = true

    if (message === "") message = "У вас нет сохраненных материалов."
    ctx.reply(message, paginationKeyboard)
})

// these 2 actions are checking if the user is located on lowest/highest page possible and if not changes the page and edits message with new page materials
bot.action('back', (ctx) => {
    if (clamp(ctx.session.page-1, 1, ctx.session.pages) != ctx.session.page) {
        ctx.session.page--
        let message = createUrlList(ctx.session.links, ctx.session.page)
        
        if (message === "") return
        ctx.editMessageText(message, paginationKeyboard)
    } 
})
bot.action('next', (ctx) => {
    if (clamp(ctx.session.page+1, 1, ctx.session.pages) != ctx.session.page) {
        ctx.session.page++
        if (ctx.session.page === ctx.session.pages) ctx.session.isEverythinRead = true

        let message = createUrlList(ctx.session.links, ctx.session.page)
        
        if (message === "") return
        ctx.editMessageText(message, paginationKeyboard)
    }
})

// launches the bot
// bot.launch()

// creates initial node-schedule jobs map from the db
createJobsList(bot, jobsList)

// AWS event handler syntax (https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html)
exports.handler = async event => {
    try {
      await bot.handleUpdate(JSON.parse(event.body))
      return { statusCode: 200, body: "" }
    } catch (e) {
      console.error("error in handler:", e)
      return { statusCode: 400, body: "This endpoint is meant for bot and telegram communication" }
    }
  }