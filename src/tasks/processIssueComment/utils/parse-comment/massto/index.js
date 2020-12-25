const nlp = require('compromise')

// Types that are valid (multi words must all be lower case)
const validContributionTypes = [
    'a11y',
    'audio',
    'blog',
    'bug',
    'business',
    'code',
    'content',
    'data',
    'design',
    'doc',
    'eventorganizing',
    'example',
    'financial',
    'fundingfinding',
    'ideas',
    'infra',
    'maintenance',
    'platform',
    'plugin',
    'projectManagement',
    'question',
    'review',
    'security',
    'talk',
    'test',
    'tool',
    'translation',
    'tutorial',
    'usertesting',
    'video',
]

// Types that are valid multi words, that we need to re map back to their camelCase parts
const validMultiContributionTypesMapping = {
    eventorganizing: 'eventOrganizing',
    fundingfinding: 'fundingFinding',
    usertesting: 'userTesting',
    projectmanagement: 'projectManagement',
}

// Additional terms to match to types (plurals, aliases etc)
const contributionTypeMappings = {
    accessibility: 'a11y',
    blogs: 'blog',
    blogging: 'blog',
    bugs: 'bug',
    codes: 'code',
    coding: 'code',
    dataset: 'data',
    datasets: 'data',
    designing: 'design',
    // TODO Fix this
    desigs: 'design',
    doc: 'doc',
    docs: 'doc',
    documenting: 'doc',
    documentation: 'doc',
    examples: 'example',
    finance: 'financial',
    financials: 'financial',
    funds: 'fundingfinding',
    idea: 'ideas',
    infras: 'infra',
    infrastructure: 'infra',
    maintaining: 'maintenance',
    management: 'projectManagement',
    managing: 'projectManagement',
    music: 'audio',
    platforms: 'platform',
    plugins: 'plugin',
    project: 'projectManagement',
    projectManaging: 'projectManagement',
    questions: 'question',
    reviews: 'review',
    securing: 'security',
    sound: 'audio',
    talks: 'talk',
    tests: 'test',
    testing: 'test',
    tools: 'tool',
    tooling: 'tool',
    translator: 'translation',
    translating: 'translation',
    translations: 'translation',
    tutorials: 'tutorial',
    videoes: 'video',
}

// Additional terms to match to types (plurals, aliases etc) that are multi word
const contributionTypeMultiWordMapping = {
    'audio production': 'audio',
    'audio recording': 'audio',
    'music production': 'audio',
    'data collection': 'data',
    'data collections': 'data',
    'data set': 'data',
    'data sets': 'data',
    'event organizing': 'eventOrganizing',
    'fund finding': 'fundingFinding',
    'funding finding': 'fundingFinding',
    'user testing': 'userTesting',
    'business development': 'business',
    'project management': 'projectManagement',
}

const Contributions = {}

validContributionTypes.forEach(type => {
    Contributions[type] = 'Contribution'
})

Object.keys(contributionTypeMappings).forEach(type => {
    Contributions[`${type}`] = 'Contribution'
})

const plugin = {
    words: {
        ...Contributions,
        add: 'Action',
    },
}

nlp.plugin(plugin)

function parseAddComment(message, action) {
    const whoMatched = nlp(message)
        .match(`${action} [.]`)
        .normalize({
            // We cannot use whitespace: true, because that gets rid of trailing hyphens.
            whitespace: false, // remove hyphens, newlines, and force one space between words
            case: false, // keep only first-word, and 'entity' titlecasing
            numbers: false, // turn 'seven' to '7'
            punctuation: true, // remove commas, semicolons - but keep sentence-ending punctuation
            unicode: false, // visually romanize/anglicize 'Björk' into 'Bjork'.
            contractions: false, // turn "isn't" to "is not"
            acronyms: false, //remove periods from acronyms, like 'F.B.I.'
            parentheses: false, //remove words inside brackets (like these)
            possessives: false, // turn "Google's tax return" to "Google tax return"
            plurals: false, // turn "batmobiles" into "batmobile"
            verbs: false, // turn all verbs into Infinitive form - "I walked" → "I walk"
            honorifics: false, //turn 'Vice Admiral John Smith' to 'John Smith'
        })
        .data()[0]
        .text.replace(/\s/g, '')

    const who = whoMatched.startsWith('@') ? whoMatched.substr(1) : whoMatched

    // Contributions
    const doc = nlp(message).toLowerCase()
    // This is to support multi word 'matches' (although the compromise docs say it supports this *confused*)
    Object.entries(contributionTypeMultiWordMapping).forEach(
        ([multiWordType, singleWordType]) => {
            doc.replace(multiWordType, singleWordType)
        },
    )
    const contributions = doc
        .match('#Contribution')
        .data()
        .map(data => {
            // This removes whitespace, commas etc
            return data.normal
        })
        .map(type => {
            if (contributionTypeMappings[type])
                return contributionTypeMappings[type]
            return type
        })
        .map(type => {
            // Convert usertesting to userTesting for the node api
            if (validMultiContributionTypesMapping[type])
                return validMultiContributionTypesMapping[type]
            return type
        })

    return {
        action: 'add',
        who,
        contributions,
    }
}

function parseComment(message) {
    const doc = nlp(message)

    const action = doc
        .toLowerCase()
        .match('#Action')
        .normalize()
        .out('string')

    if (action === 'add') {
        return parseAddComment(message, action)
    }

    return {
        action: false,
    }
}

module.exports = parseComment
