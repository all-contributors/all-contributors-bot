const uuid = require('uuid')
const fetch = require('node-fetch')

class Analytics {
    constructor({ user, repo, owner, apiKey, log }) {
        this.user = user
        this.repo = repo
        this.owner = owner
        this.eventPromises = []
        this.funnel_id = uuid.v4()
        this.apiKey = apiKey || process.env.AMPLITUDE_API_KEY
        this.log = log
    }

    track(eventName, metadata = {}) {
        const event = {
            user_id: this.user,
            event_type: eventName,
            user_properties: {
                repo: this.repo,
                owner: this.owner,
            },
            event_properties: {
                funnel_id: this.funnel_id,
                ...metadata,
            },
        }

        const payload = {
            api_key: this.apiKey,
            event: [
                // TODO batch up to 10 events at a time
                event,
            ],
        }

        const log = this.log

        const newEventPromise = fetch('https://api.amplitude.com/httpapi', {
            method: 'post',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'application/json' },
            timeout: 5000,
            redirect: 'error',
            follow: 0,
        })
            .then(response => {
                if (!response.ok) {
                    // TODO: error handling
                    log.error(response)
                }
                return response
            })
            .catch(error => {
                log.error(error)
            })

        this.eventPromises.push(newEventPromise)
    }

    async finishQueue() {
        if (this.eventPromises.length === 0) {
            return Promise.resolve()
        }
        return Promise.all(this.eventPromises)
    }
}

module.exports = Analytics
