import { logger } from '../utils/logger.js';
import { whatsappService } from '../services/whatsapp.service.js';
import {
  communityService,
  CommunityRateLimitError,
} from '../services/community.service.js';
import { siteRepository } from '../repositories/site.repository.js';
import {
  whatsappContributorHash,
  publicContributorHandle,
} from '../utils/contributor.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import {
  COMMUNITY_DISCLAIMER,
  REPUTATION_DISCLAIMER,
  EVIDENCE_STATE_LABEL,
  EVIDENCE_TYPES,
  type CommunityEvidenceType,
} from '../types/community.types.js';

/**
 * WhatsApp Community Discovery commands (spec section 4).
 *
 * Every command is a text message beginning with a keyword. The command word is
 * stripped before the argument is stored, so a participant's question text is
 * preserved verbatim.
 *
 * Design constraints honoured here:
 *
 *  - No phone number is ever stored, echoed, or used as a display value.
 *  - A community action must never be reported as successful when the database
 *    is unavailable. Commands fail loudly with an honest message instead.
 *  - Replies never claim a scientific conclusion. Community agreement is
 *    described as agreement, never as confirmation.
 */

export const COMMUNITY_COMMANDS = {
  INVESTIGATE: 'INVESTIGATE',
  VOTE: 'VOTE',
  EVIDENCE: 'EVIDENCE',
  ASK: 'ASK',
  ANSWER: 'ANSWER',
  VISIT: 'VISIT',
  SITES: 'SITES',
  SITE: 'SITE',
  EXPLORE: 'EXPLORE',
  REP: 'REP',
  COMMUNITY_HELP: 'COMMUNITYHELP',
} as const;

/**
 * Uses the canonical evidence-type list from the type module so the WhatsApp
 * command surface can never drift from what the database accepts.
 */
const EVIDENCE_TYPE_HELP = EVIDENCE_TYPES.join(', ');

/**
 * WhatsApp message bodies are capped well below Meta's limit so that a long
 * argument cannot push a reply into an un-sendable size.
 */
const MAX_WHATSAPP_TEXT = 4096;

function truncate(text: string, max = MAX_WHATSAPP_TEXT): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

/**
 * Splits a command line into its verb and argument.
 *
 * Matching is case-insensitive and tolerant of a leading `/` so both
 * `VOTE basalt` and `/vote basalt` work.
 */
export function parseCommand(rawText: string): { verb: string; argument: string } | null {
  const trimmed = rawText.trim().replace(/^\//, '');
  if (!trimmed) return null;

  const match = /^([A-Za-z]+)\s*([\s\S]*)$/.exec(trimmed);
  if (!match) return null;

  return { verb: match[1].toUpperCase(), argument: match[2].trim() };
}

export class CommunityCommandService {
  /**
   * Builds the reply text for a community command without sending anything.
   *
   * Exposed separately from `handleTextMessage` so the command surface can be
   * tested deterministically, with no outbound network call and no WhatsApp
   * credentials required.
   */
  async buildReply(senderPhoneNumber: string, rawText: string): Promise<string | null> {
    const parsed = parseCommand(rawText);
    if (!parsed) return null;
    if (!this.isCommunityCommand(parsed.verb)) return null;

    const contributor = whatsappContributorHash(senderPhoneNumber);
    try {
      return await this.dispatch(parsed.verb, parsed.argument, contributor);
    } catch (err) {
      return err instanceof CommunityRateLimitError ? `⏳ ${err.message}` : this.failureMessage(err);
    }
  }

  private isCommunityCommand(verb: string): boolean {
    return (
      verb === COMMUNITY_COMMANDS.INVESTIGATE ||
      verb === COMMUNITY_COMMANDS.VOTE ||
      verb === COMMUNITY_COMMANDS.EVIDENCE ||
      verb === COMMUNITY_COMMANDS.ASK ||
      verb === COMMUNITY_COMMANDS.ANSWER ||
      verb === COMMUNITY_COMMANDS.VISIT ||
      verb === COMMUNITY_COMMANDS.SITES ||
      verb === COMMUNITY_COMMANDS.SITE ||
      verb === COMMUNITY_COMMANDS.EXPLORE ||
      verb === COMMUNITY_COMMANDS.REP ||
      verb === COMMUNITY_COMMANDS.COMMUNITY_HELP
    );
  }

  /**
   * Routes a text message to a community command.
   *
   * Returns true when the message was a community command and a reply was
   * dispatched, false when the message is not a community command so the
   * caller can fall back to the normal Stage 1-3 text handling.
   */
  async handleTextMessage(senderPhoneNumber: string, rawText: string): Promise<boolean> {
    const parsed = parseCommand(rawText);
    if (!parsed) return false;

    const { verb, argument } = parsed;
    if (!this.isCommunityCommand(verb)) return false;

    const contributor = whatsappContributorHash(senderPhoneNumber);

    try {
      const reply = await this.dispatch(verb, argument, contributor);
      await whatsappService.sendTextMessage(senderPhoneNumber, truncate(reply));
      return true;
    } catch (err) {
      const reply =
        err instanceof CommunityRateLimitError
          ? `⏳ ${err.message}`
          : this.failureMessage(err);

      // An unconfigured database is an expected deployment state, not a fault,
      // so it is logged as a warning rather than an error.
      if (isDatabaseConfigured()) {
        logger.error('Community command failed', { verb, error: String(err) });
      } else {
        logger.warn('Community command rejected: community database not configured', { verb });
      }

      await whatsappService.sendTextMessage(senderPhoneNumber, truncate(reply));
      return true;
    }
  }

  /**
   * Converts a failure into an honest user-facing message.
   *
   * A configuration problem is reported as such rather than being disguised as
   * "no results", which would wrongly suggest the community has no records.
   */
  private failureMessage(err: unknown): string {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const unavailable = !isDatabaseConfigured() || /not configured|requires a configured database/i.test(msg);
    if (unavailable) {
      return `⚠️ Community features are not available right now because the community database is not configured. Nothing you sent has been recorded, and no community data is being shown.`;
    }
    return `⚠️ That did not work and nothing was recorded. Please try again.`;
  }

  private async dispatch(verb: string, argument: string, contributor: string): Promise<string> {
    if (!isDatabaseConfigured()) {
      // Fail before doing any work so no partial state is created.
      throw new Error('The community database is not configured.');
    }

    switch (verb) {
      case COMMUNITY_COMMANDS.COMMUNITY_HELP:
        return this.helpText();
      case COMMUNITY_COMMANDS.SITES:
        return this.listSites(argument);
      case COMMUNITY_COMMANDS.SITE:
      case COMMUNITY_COMMANDS.EXPLORE:
        return this.exploreSite(argument);
      case COMMUNITY_COMMANDS.INVESTIGATE:
        return this.openInvestigation(argument, contributor);
      case COMMUNITY_COMMANDS.VOTE:
        return this.vote(argument, contributor);
      case COMMUNITY_COMMANDS.EVIDENCE:
        return this.addEvidence(argument, contributor);
      case COMMUNITY_COMMANDS.ASK:
        return this.askQuestion(argument, contributor);
      case COMMUNITY_COMMANDS.ANSWER:
        return this.answerQuestion(argument, contributor);
      case COMMUNITY_COMMANDS.VISIT:
        return this.recordVisit(argument, contributor);
      case COMMUNITY_COMMANDS.REP:
        return this.reputation(contributor);
      default:
        return this.helpText();
    }
  }

  // ===========================================================================
  // Commands
  // ===========================================================================

  private helpText(): string {
    return `🪨 EARTH TALK — COMMUNITY

Contribute what you know. Your phone number is never stored or shown.

🔎 INVESTIGATE <question>
   Ask the community to look into a rock or site.
   Example: INVESTIGATE Is this basalt or granite?

🗳️ VOTE <INV-id> <option>
   Add your view to an investigation.
   Example: VOTE INV-000123 Basalt

🔬 EVIDENCE <INV-id> <type> <what you saw>
   Types: ${EVIDENCE_TYPE_HELP}
   Example: EVIDENCE INV-000123 field_note dark grey, fine grained

❓ ASK <question>
   Ask a geological question.
   Example: ASK What mineral makes this green colour?

💬 ANSWER <Q-id> <your answer>
   Help answer someone else's question.

📍 VISIT <site-id> [YYYY-MM-DD] [notes]
   Record a visit to a known site.

🗺️ SITES [district]
   List geological sites.

🔭 SITE <site-id or code>
   Show a site with its AI reading, community record and any expert review, kept clearly separate.

📊 REP
   Your contribution profile.

${COMMUNITY_DISCLAIMER}`;
  }

  private async listSites(argument = ''): Promise<string> {
    // The help text advertises an optional district filter, so honour it
    // instead of silently listing the whole country.
    const district = argument.trim();
    const { rows } = await siteRepository.listPublicSites({
      district: district || undefined,
      limit: 15,
      offset: 0,
    });

    if (rows.length === 0) {
      return `🗺️ No geological sites have been published yet.

Sites appear here once real observations have been grouped for a location. Nothing is listed until it genuinely exists.

${COMMUNITY_DISCLAIMER}`;
    }

    const lines = rows.map((site) => {
      const strength = site.highest_evidence_state
        ? ` — ${EVIDENCE_STATE_LABEL[site.highest_evidence_state]}`
        : '';
      const where = site.district ? ` (${site.district})` : '';
      return `• ${site.site_code} — ${site.title}${where}
  ${site.observation_count} observation(s)${strength}`;
    });

    return `🗺️ GEOLOGICAL SITES (${rows.length})

${lines.join('\n')}

Use SITE <code> to see one in detail.

${COMMUNITY_DISCLAIMER}`;
  }

  /**
   * Renders a site with the three knowledge sources kept visibly separate.
   *
   * This is the most important reply in the whole feature: it must never read
   * as though the AI reading, the community's view and an expert review are the
   * same kind of statement.
   */
  private async exploreSite(reference: string): Promise<string> {
    if (!reference) {
      return 'Please send a site code, for example: SITE RT-SITE-000001';
    }

    const byCode = await siteRepository.findSiteByCode(reference);
    const site = byCode ?? (await siteRepository.findSiteById(reference));

    if (!site) {
      return `🔭 I could not find a site with the code "${reference}".

Use SITES to see the published sites.`;
    }

    const payload = await communityService.buildSiteExplorer(site.id);
    if (!payload) return 'That site is not published.';

    const parts: string[] = [];

    parts.push(`🔭 ${payload.site.title}`);
    parts.push(`Code: ${payload.site.site_code}`);
    if (payload.site.district) parts.push(`District: ${payload.site.district}`);

    // 1. AI interpretation.
    parts.push('');
    parts.push('🤖 AI INTERPRETATION (automated, unverified)');
    if (payload.ai_interpretation) {
      parts.push(
        `Reading: ${payload.ai_interpretation.primary_classification}${
          payload.ai_interpretation.possible_name
            ? ` — ${payload.ai_interpretation.possible_name}`
            : ''
        }`
      );
      parts.push(`Confidence: ${payload.ai_interpretation.confidence}`);
    } else {
      parts.push('No AI interpretation is available for this site.');
    }

    // 2. Community record.
    parts.push('');
    parts.push('👥 COMMUNITY RECORD (what people reported)');
    parts.push(
      `Investigations: ${payload.community.investigation_count} · Questions: ${payload.community.question_count} · Evidence: ${payload.community.evidence_count} · Visits: ${payload.community.visit_count}`
    );
    if (payload.community.investigation_count === 0 && payload.community.evidence_count === 0) {
      parts.push('The community has not investigated this site yet.');
    }

    // 3. Expert review.
    parts.push('');
    parts.push('🔎 EXPERT REVIEW');
    if (payload.expert_review) {
      parts.push(`Reviewed by: ${payload.expert_review.reviewer_label}`);
      if (payload.expert_review.expert_rock_name) {
        parts.push(`Expert reading: ${payload.expert_review.expert_rock_name}`);
      }
      if (payload.expert_review.evidence_basis) {
        parts.push(`Basis: ${payload.expert_review.evidence_basis}`);
      }
    } else {
      parts.push('No expert has reviewed this site.');
    }

    parts.push('');
    parts.push(
      'These three are different kinds of statement and are not equivalent. Community agreement is not scientific confirmation.'
    );
    parts.push(COMMUNITY_DISCLAIMER);

    return parts.join('\n');
  }

  private async openInvestigation(question: string, contributor: string): Promise<string> {
    if (!question) {
      return 'Please include the question.\nExample: INVESTIGATE Is this basalt or granite?';
    }

    const investigation = await communityService.openInvestigation({ question }, contributor);

    return `🔎 Investigation opened.

Your public reference is ${investigation.public_id}. Share that code and others can vote or add evidence.

Your contributor handle is ${investigation.opened_by_handle ?? publicContributorHandle(contributor)}.

${COMMUNITY_DISCLAIMER}`;
  }

  private async vote(argument: string, contributor: string): Promise<string> {
    // Expected: VOTE <INV-id> <option>
    const parts = argument.split(/\s+/);
    if (parts.length < 2 || !parts[0] || !parts.slice(1).join(' ').trim()) {
      return 'Please include the investigation code and your view.\nExample: VOTE INV-000123 Basalt';
    }

    const [investigationId, ...rest] = parts;
    const option = rest.join(' ');

    const result = await communityService.castVote({ investigationPublicId: investigationId, option }, contributor);

    return `🗳️ ${result.message}\n\nYour view on ${investigationId}: ${result.option}\n\nYour vote is counted once. Changing it replaces your earlier vote.\n\n${COMMUNITY_DISCLAIMER}`;
  }

  private async addEvidence(argument: string, contributor: string): Promise<string> {
    // Expected: EVIDENCE <INV-id> <type> <explanation>
    const parts = argument.split(/\s+/);
    if (parts.length < 3) {
      return `Please include the investigation code, the evidence type and what you saw.

Example: EVIDENCE INV-000123 field_note dark grey and fine grained

Types: ${EVIDENCE_TYPE_HELP}`;
    }

    const [investigationId, rawType, ...rest] = parts;
    const evidenceType = rawType.toLowerCase().replace(/\s+/g, '_') as CommunityEvidenceType;

    if (!EVIDENCE_TYPES.includes(evidenceType)) {
      return `"${rawType}" is not a recognised evidence type.

Use one of: ${EVIDENCE_TYPE_HELP}`;
    }

    const explanation = rest.join(' ').trim();
    if (!explanation) return 'Please describe what you saw.';

    const item = await communityService.submitEvidence(
      { investigationId, evidenceType, explanation },
      contributor
    );

    return `🔬 Thank you. Your evidence was recorded as ${item.evidence_type.replace(/_/g, ' ')}.

It will be read alongside other contributions. Recording evidence does not confirm the rock — it documents what you observed.\n\n${COMMUNITY_DISCLAIMER}`;
  }

  private async askQuestion(question: string, contributor: string): Promise<string> {
    if (!question) {
      return 'Please include your question.\nExample: ASK What mineral makes this green colour?';
    }

    const asked = await communityService.askQuestion({ question }, contributor);

    return `❓ Question posted.

Your public reference is ${asked.public_id}. Others can answer it.\n\n${COMMUNITY_DISCLAIMER}`;
  }

  private async answerQuestion(argument: string, contributor: string): Promise<string> {
    // Expected: ANSWER <Q-id> <answer>
    const parts = argument.split(/\s+/);
    if (parts.length < 2) {
      return 'Please include the question code and your answer.\nExample: ANSWER Q-000045 Feldspar is common in granite.';
    }

    const [questionId, ...rest] = parts;
    const answer = rest.join(' ').trim();
    if (!answer) return 'Please include your answer.';

    const posted = await communityService.postAnswer({ questionPublicId: questionId, answer }, contributor);

    return `💬 Answer recorded as ${posted.contributor_handle}.

Answers are opinions from contributors, not verified geological determinations.\n\n${COMMUNITY_DISCLAIMER}`;
  }

  private async recordVisit(argument: string, contributor: string): Promise<string> {
    // Expected: VISIT <site-id> [YYYY-MM-DD] [notes]
    const parts = argument.split(/\s+/);
    if (!parts[0]) {
      return 'Please include the site code.\nExample: VISIT RT-SITE-000001 2026-03-14 Found weathered surface';
    }

    const siteReference = parts[0];
    const site =
      (await siteRepository.findSiteByCode(siteReference)) ??
      (await siteRepository.findSiteById(siteReference));

    if (!site) return `I could not find a site with the code "${siteReference}". Use SITES to see published sites.`;

    let visitedOn: string | undefined;
    let noteStart = 1;
    const dateCandidate = parts[1];
    if (dateCandidate && /^\d{4}-\d{2}-\d{2}$/.test(dateCandidate)) {
      visitedOn = dateCandidate;
      noteStart = 2;
    }

    // The help text advertises free-text notes, so they must actually be
    // recorded rather than silently dropped.
    const notes = parts.slice(noteStart).join(' ').trim() || undefined;

    const visit = await communityService.recordVisit({ siteId: site.id, visitedOn, notes }, contributor);

    return `📍 Visit recorded for ${site.site_code} on ${visit.visited_on} by ${visit.contributor_handle}.

${COMMUNITY_DISCLAIMER}`;
  }

  private async reputation(contributor: string): Promise<string> {
    const reputation = await communityService.getReputation(contributor);

    const total =
      reputation.observations_count +
      reputation.evidence_count +
      reputation.votes_count +
      reputation.questions_count +
      reputation.answers_count +
      reputation.visits_count +
      reputation.investigations_count;

    if (total === 0) {
      return `📊 Your contribution profile is currently empty.

Send a rock photo, or use INVESTIGATE, ASK, or VOTE to start contributing.

${REPUTATION_DISCLAIMER}`;
    }

    return `📊 YOUR CONTRIBUTIONS

Handle: ${reputation.public_handle}
Observations: ${reputation.observations_count}
Evidence: ${reputation.evidence_count}
Votes: ${reputation.votes_count}
Investigations: ${reputation.investigations_count}
Questions: ${reputation.questions_count}
Answers: ${reputation.answers_count}
Visits: ${reputation.visits_count}
Districts represented: ${reputation.districts_represented}

${REPUTATION_DISCLAIMER}`;
  }
}

export const communityCommandService = new CommunityCommandService();