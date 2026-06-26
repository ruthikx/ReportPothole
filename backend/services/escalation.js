const Ticket = require('../models/Ticket');
const User = require('../models/User');
const { sendPushNotification, sendSms } = require('./notifications');

const ESCALATION_LEVELS = {
  0: { role: 'worker', label: 'Supervisor' },
  1: { role: 'worker', label: 'Engineer Officer' },
  2: { role: 'admin', label: 'Commissioner' },
  3: { role: 'admin', label: 'Commissioner' },
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
      ticket.escalationLevel = newLevel;
      await ticket.save();

      const levelConfig = ESCALATION_LEVELS[newLevel];
      const officers = await User.find({
        role: levelConfig.role,
        ward: ticket.ward ? ticket.ward._id : { $exists: true },
      });

      for (const officer of officers) {
        const message = `URGENT: Pothole ticket ${ticket.reportId} is overdue. Escalation Level ${newLevel} — ${levelConfig.label} notified.`;

        if (officer.fcmToken) {
          await sendPushNotification(
            officer.fcmToken,
            `Escalation Level ${newLevel}: ${ticket.reportId}`,
            message,
            { ticketId: ticket._id.toString(), reportId: ticket.reportId }
          );
        }

        if (officer.phone) {
          await sendSms(officer.phone, message);
        }
      }

      if (newLevel >= 3) {
        const admins = await User.find({ role: 'admin' });
        for (const admin of admins) {
          await sendPushNotification(
            admin.fcmToken,
            `Max Escalation: ${ticket.reportId}`,
            `Ticket ${ticket.reportId} has reached maximum escalation level. Immediate action required.`,
            { ticketId: ticket._id.toString(), reportId: ticket.reportId }
          );
        }
      }

      console.log(`[Escalation] Escalated ${ticket.reportId} to level ${newLevel}`);
    } catch (err) {
      console.error(`[Escalation] Failed to escalate ${ticket.reportId}:`, err.message);
    }
  }
};

module.exports = { runEscalationJob };
