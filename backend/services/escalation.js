const Ticket = require('../models/Ticket');
const User = require('../models/User');
const { dispatchNotification } = require('./notificationQueue');
const { recordTicketEvent, systemActor } = require('./ticketEvents');

const ESCALATION_LEVELS = {
  1: { roles: ['supervisor'], label: 'Supervisor', channels: ['fcm', 'sms', 'email'] },
  2: { roles: ['engineer'], label: 'Engineer Officer', channels: ['sms', 'email'] },
  3: { roles: ['commissioner', 'admin'], label: 'Commissioner', channels: ['sms', 'email'] },
};

const escalationMatchFor = (ticket, levelConfig) => {
  const match = { role: { $in: levelConfig.roles } };

  if (ticket.ward && levelConfig.roles.includes('supervisor')) {
    match.$or = [{ ward: ticket.ward._id }, { ward: { $exists: false } }];
  }

  return match;
};

const runEscalationJob = async () => {
  const now = new Date();

  const overdueTickets = await Ticket.find({
    status: { $ne: 'resolved' },
    slaDeadline: { $lt: now },
    escalationLevel: { $lt: 3 },
  }).populate('ward');

  console.log(`[Escalation] Found ${overdueTickets.length} overdue tickets`);

  for (const ticket of overdueTickets) {
    try {
      const newLevel = Math.min(ticket.escalationLevel + 1, 3);
      const levelConfig = ESCALATION_LEVELS[newLevel];
      const previousLevel = ticket.escalationLevel;

      ticket.escalationLevel = newLevel;
      await ticket.save();
      await recordTicketEvent({
        ticketId: ticket._id,
        actor: systemActor('Escalation job'),
        action: 'escalated',
        from: { escalationLevel: previousLevel },
        to: { escalationLevel: newLevel },
        note: `Escalated to level ${newLevel}.`,
      });

      const officers = await User.find(escalationMatchFor(ticket, levelConfig));
      for (const officer of officers) {
        await dispatchNotification(officer, {
          title: `Escalation L${newLevel}: ${ticket.reportId}`,
          body: `Pothole ticket ${ticket.reportId} is overdue. ${levelConfig.label} review is required.`,
          channels: levelConfig.channels,
        });
      }

      console.log(`[Escalation] Escalated ${ticket.reportId} to level ${newLevel}`);
    } catch (err) {
      console.error(`[Escalation] Failed to escalate ${ticket.reportId}:`, err.message);
    }
  }
};

module.exports = { runEscalationJob, ESCALATION_LEVELS };
