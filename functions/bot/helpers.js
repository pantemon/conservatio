const fs = require('fs')
const schedule = require('node-schedule')

// clamps number
const clamp = (num, min, max) => Math.min(Math.max(num, min), max);

// checks if timezone is valid
function isValidTimeZone(tz) {
    try {
        Intl.DateTimeFormat(undefined, {timeZone: tz})
        return true
    } catch (error) {
        return false;
    }
}

// creates string with formatted materials from certain page
function createUrlList(links,currentPage) {
    let res = ""
    for (let i = 10*currentPage-10; i < Math.min(links.length, 10*currentPage); i++) {
        if (typeof links !== 'undefined' && links.length > 0) {
            let url = links[i].text
            let domain = new URL(url)
            let order = links[i].order
            domain = domain.hostname
            domain = domain.replace("www.", "")
            res += `<a href='${url}'>${domain} (${order})</a>\n`     
        } else {
            return res
        }
    }
    return res
}

// sends everydays messages
function sendStuff(bot, chatId, isEverythinRead) {
    const d = new Date()
    let day = d.getDay()
    let message = ""
    //let videoToSend = "media/"
    switch (day) {
        case 0:
            message += "воскресенье"
            //videoToSend += "Sunday.mp4"
            break;
        case 1:
            message += "понедельник"
            //videoToSend += "Monday.mp4"
            break;
        case 2:
            message += "вторник"
            //videoToSend += "Tuesday.mp4"
            break;
        case 3:
            message += "среда"
            //videoToSend += "Wednesday.MOV"
            break;
        case 4:
            message += "четверг"
            //videoToSend += "Thursday.MP4"
            break;
        case 5:
            message += "пятница"
            //videoToSend += "Friday.mp4"
            break;
        case 6:
            message += "суббота"
            //videoToSend += "Saturday.mp4"
            break;
        default:
            break;
    }
    bot.telegram.sendMessage(chatId, "Хаха сегодня " + message)
    // bot.telegram.sendChatAction(chatId, "upload_video")
    // bot.telegram.sendVideo(chatId, {source: videoToSend})
    if (!isEverythinRead) bot.telegram.sendMessage(chatId, "У вас остались непрочитанные материалы. Введите команду /mymaterials чтобы получить доступ к ним")
    
}

// creates node-schedule recurrenceRule based on hour minute and timezone arguments
function createRecurrenceRule(hour, minute, timezone) {
    const rule = new schedule.RecurrenceRule();
    rule.hour = hour;
    rule.minute = minute;
    rule.tz = timezone;
    return rule
}

// creates node-schedule job
function createJob(rule, callback) {
    return schedule.scheduleJob(rule, callback)
}

// creates initial node-schedule jobs map from the db 
function createJobsList(bot, jobsList) {
    let db = JSON.parse(fs.readFileSync('db.json', 'utf8'));
    for (const user of db.sessions) {
        const rule = createRecurrenceRule(user.data.morningHour, user.data.morningMinute, user.data.morningTimezone)

        const job = schedule.scheduleJob(rule, function(){
            sendStuff(bot, user.data.chatId, user.data.isEverythinRead)
        });
        jobsList.set(user.data.chatId, job)
    }
}

module.exports = { clamp, isValidTimeZone, createUrlList, sendStuff, createRecurrenceRule, createJob, createJobsList }