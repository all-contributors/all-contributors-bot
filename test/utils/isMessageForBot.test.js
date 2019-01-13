const isMessageForBot = require('../../src/utils/isMessageForBot')

describe('isMessageForBot', () => {
    const testBotName = 'AllContributorsBotTest'

    test('For us', () => {
        expect(
            isMessageForBot(
                `@${testBotName} please add jakebolam for doc, infra and code`,
            ),
        ).toBe(true)

        expect(
            isMessageForBot(
                `@AllContributorsBotTest please add jakebolam for doc, infra and code`,
            ),
        ).toBe(true)
    })

    test('Not for us', () => {
        expect(
            isMessageForBot(
                `${testBotName} please add jakebolam for doc, infra and code`,
            ),
        ).toBe(false)

        expect(
            isMessageForBot(`Please add jakebolam for doc, infra and code`),
        ).toBe(false)
    })
})
