const parseComment = require('../../../../../src/tasks/processIssueComment/utils/parse-comment')

describe('parseComment', () => {
    const testBotName = 'all-contributors'

    test('Basic intent to add', () => {
        expect(
            parseComment(
                `@${testBotName} please add jakebolam for doc, infra and code`,
            ),
        ).toEqual({
            action: 'add',
            contributors: {
                jakebolam: ['doc', 'infra', 'code'],
            },
        })
    })

    test('Basic intent to add - ignore case (for action and contributions, NOT for user)', () => {
        expect(
            parseComment(
                `@${testBotName} please Add jakeBolam for DOC, inFra and coDe`,
            ),
        ).toEqual({
            action: 'add',
            contributors: {
                jakeBolam: ['doc', 'infra', 'code'],
            },
        })
    })

    test('Basic intent to add - non name username', () => {
        expect(
            parseComment(`@${testBotName} please add tbenning for design`),
        ).toEqual({
            action: 'add',
            contributors: {
                tbenning: ['design'],
            },
        })
    })

    test('Basic intent to add - captialized username', () => {
        expect(
            parseComment(`@${testBotName} please add Rbot25_RULES for tool`),
        ).toEqual({
            action: 'add',
            contributors: {
                Rbot25_RULES: ['tool'],
            },
        })
    })

    test('Basic intent to add - with plurals', () => {
        expect(
            parseComment(`@${testBotName} please add dat2 for docs`),
        ).toEqual({
            action: 'add',
            contributors: {
                dat2: ['doc'],
            },
        })
    })

    // TODO:
    // test('Add multiple when not spaced (just split via commas)', () => {
    //     expect(
    //         parseComment(
    //             `@${testBotName} please add @stevoo24 for code,content`,
    //         ),
    //     ).toEqual({
    //         action: 'add',
    //         contributors: {
    //             stevoo24: ['code', 'content'],
    //         },
    //     })
    // })

    // TODO:
    // test(`Interpret users who's names are contributions`, () => {
    //     expect(
    //         parseComment(`@${testBotName} please add @ideas for ideas`),
    //     ).toEqual({
    //         action: 'add',
    //         contributors: {
    //             ideas: ['ideas'],
    //         },
    //     })
    // })

    test('Support full words (like infrastructure)', () => {
        expect(
            parseComment(
                `@${testBotName} please add jakebolam for infrastructure, documentation`,
            ),
        ).toEqual({
            action: 'add',
            contributors: {
                jakebolam: ['infra', 'doc'],
            },
        })
    })

    test('Support adding people with mentions', () => {
        expect(
            parseComment(
                `@${testBotName} please add @sinchang for infrastructure`,
            ),
        ).toEqual({
            action: 'add',
            contributors: {
                sinchang: ['infra'],
            },
        })
    })

    test('Support alternative sentences', () => {
        expect(
            parseComment(`@${testBotName} add @sinchang for infrastructure`),
        ).toEqual({
            action: 'add',
            contributors: {
                sinchang: ['infra'],
            },
        })

        expect(
            parseComment(
                `Jane you are crushing it in documentation and your infrastructure work has been great too, let's add jane.doe23 for her contributions. cc @${testBotName}`,
            ),
        ).toEqual({
            action: 'add',
            contributors: {
                'jane.doe23': ['doc', 'infra'],
            },
        })
    })

    test('Support split words (like user testing)', () => {
        expect(
            parseComment(
                `@${testBotName} please add jakebolam for infrastructure, fund finding`,
            ),
        ).toEqual({
            action: 'add',
            contributors: {
                jakebolam: ['infra', 'fundingFinding'],
            },
        })

        expect(
            parseComment(
                `@${testBotName} please add jakebolam for infrastructure, user testing and testing`,
            ),
        ).toEqual({
            action: 'add',
            contributors: {
                jakebolam: ['infra', 'userTesting', 'test'],
            },
        })
    })

    test('Support split words types that are referenced via other terms (e.g. a plural split word)', () => {
        expect(
            parseComment(
                `@${testBotName} please add @jakebolam for infrastructure, funds`,
            ),
        ).toEqual({
            action: 'add',
            contributors: {
                jakebolam: ['infra', 'fundingFinding'],
            },
        })
    })
    // test('Add multiple users in 1 hit - for some contributions', () => {
    //     expect(
    //         parseComment(
    //             `@${testBotName} please add @jakebolam and @tbenning for doc and review`,
    //         ),
    //     ).toEqual({
    //         action: 'add',
    //         contributors: {
    //             jakebolam: ['doc', 'review'],
    //             tbenning: ['doc', 'review'],
    //         },
    //     })
    // })
    //
    // test('Add multiple users in 1 hit - seperate sentences', () => {
    //     expect(
    //         parseComment(
    //             `@${testBotName} add @kazydek for doc, review, maintenance. Please add akucharska for code, maintenance. Please add derberg for doc, examples, ideas`,
    //         ),
    //     ).toEqual({
    //         action: 'add',
    //         contributors: {
    //             kazydek: ['doc', 'review', 'maintenance'],
    //             akucharska: ['code', 'maintenance'],
    //             derberg: ['examples', 'ideas'],
    //         },
    //     })
    // })

    //
    // test('Add multiple users in 1 hit - sentences seperated by commas :think:', () => {
    //     expect(
    //         parseComment(
    //             `@${testBotName} please add kazydek for doc, review, maintenance, please add akucharska for code, maintenance and please add derberg for doc, examples, ideas`,
    //         ),
    //     ).toEqual({
    //         action: 'add',
    //         contributors: {
    //             jakebolam: ['infra', 'fundingFinding'],
    //         },
    //     })
    // })
    //
    // test('Add multiple users in 1 hit - from seperate lines', () => {
    //     expect(
    //         parseComment(
    //             `
    // @all-contributors please add @mikeattara for ideas
    // @all-contributors please add @The24thDS for code`
    // please add @tbenning for code`
    //         ),
    //     ).toEqual({
    //         action: 'add',
    //         contributors: {
    //             jakebolam: ['infra', 'fundingFinding'],
    //         },
    //     })
    // })

    test('Intent unknown', () => {
        expect(
            parseComment(`@${testBotName} please lollmate for tool`),
        ).toEqual({
            action: false,
        })
    })
})
