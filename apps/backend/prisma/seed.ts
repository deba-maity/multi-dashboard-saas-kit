import { PrismaClient, MemberRole, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const cents = (amount: number) => Math.round(amount * 100);
const pick = <T>(items: T[], index: number) => items[index % items.length];

async function main() {
  await prisma.refreshToken.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.product.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.task.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.systemLog.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.insight.deleteMany();
  await prisma.organizationMember.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const organization = await prisma.organization.create({
    data: {
      name: "Northstar Labs",
      slug: "northstar-labs",
      plan: "Enterprise"
    }
  });

  const passwordHash = await bcrypt.hash("Password123!", 12);
  const users = await Promise.all(
    [
      ["Avery Stone", "avery@northstar.test", MemberRole.ADMIN, UserStatus.ACTIVE],
      ["Maya Chen", "maya@northstar.test", MemberRole.ADMIN, UserStatus.ACTIVE],
      ["Jordan Lee", "jordan@northstar.test", MemberRole.MEMBER, UserStatus.ACTIVE],
      ["Sam Rivera", "sam@northstar.test", MemberRole.MEMBER, UserStatus.INVITED],
      ["Priya Shah", "priya@northstar.test", MemberRole.MEMBER, UserStatus.ACTIVE],
      ["Theo Martin", "theo@northstar.test", MemberRole.MEMBER, UserStatus.SUSPENDED]
    ].map(([name, email, role, status], index) =>
      prisma.user.create({
        data: {
          name: name as string,
          email: email as string,
          passwordHash,
          status: status as UserStatus,
          lastActiveAt: daysAgo(index + 1),
          memberships: {
            create: {
              organizationId: organization.id,
              role: role as MemberRole
            }
          }
        }
      })
    )
  );

  const productSeeds = [
    ["Pulse Analytics Seat", "PULSE-SEAT", "Software", 79],
    ["Automation Pack", "AUTO-PACK", "Add-on", 249],
    ["Enterprise SSO", "ENT-SSO", "Security", 399],
    ["Data Warehouse Sync", "DWH-SYNC", "Data", 599],
    ["Premium Support", "SUPPORT-PRO", "Service", 299],
    ["AI Insight Credits", "AI-CREDITS", "AI", 149],
    ["Workflow Templates", "FLOW-TPL", "Productivity", 89],
    ["Audit Log Archive", "AUDIT-ARCH", "Compliance", 199]
  ];

  const products = await Promise.all(
    productSeeds.map(([name, sku, category, price], index) =>
      prisma.product.create({
        data: {
          organizationId: organization.id,
          name: name as string,
          sku: sku as string,
          category: category as string,
          priceCents: cents(price as number),
          inventoryItem: {
            create: {
              organizationId: organization.id,
              warehouse: pick(["East Hub", "West Hub", "EU 3PL"], index),
              stock: 18 + index * 9,
              reorderPoint: 22 + (index % 3) * 8,
              supplier: pick(["Atlas Supply", "Orbit Partners", "Vertex Cloud"], index)
            }
          }
        }
      })
    )
  );

  const channels = ["Web", "Retail", "Marketplace"];
  const orderStatuses = ["paid", "pending", "shipped", "refunded"];
  for (let i = 0; i < 36; i += 1) {
    const product = pick(products, i);
    const quantity = (i % 4) + 1;
    await prisma.order.create({
      data: {
        organizationId: organization.id,
        customerName: pick(["Acme Co", "BrightPath", "Cobalt Health", "Deckhouse", "Evergreen AI", "FrameWorks"], i),
        status: pick(orderStatuses, i),
        channel: pick(channels, i),
        totalCents: product.priceCents * quantity,
        createdAt: daysAgo(110 - i * 3),
        items: {
          create: {
            productId: product.id,
            quantity,
            priceCents: product.priceCents
          }
        }
      }
    });
  }

  for (let i = 0; i < 30; i += 1) {
    await prisma.transaction.create({
      data: {
        organizationId: organization.id,
        type: pick(["subscription", "usage", "refund", "payout"], i),
        description: pick(["Stripe invoice paid", "Usage overage", "Customer refund", "Marketplace payout", "Annual contract"], i),
        amountCents: cents(pick([1200, 499, -129, 845, 3200, 760], i)),
        status: pick(["paid", "pending", "failed", "open"], i),
        occurredAt: daysAgo(90 - i * 2)
      }
    });
  }

  for (let i = 0; i < 18; i += 1) {
    await prisma.invoice.create({
      data: {
        organizationId: organization.id,
        customerName: pick(["Acme Co", "BrightPath", "Cobalt Health", "Evergreen AI"], i),
        invoiceNumber: `INV-${String(2400 + i).padStart(5, "0")}`,
        amountCents: cents(pick([1299, 2400, 399, 819, 5200], i)),
        status: pick(["paid", "open", "overdue"], i),
        dueDate: daysAgo(pick([-14, 0, 7, 17, 32, 45, 60, 61, 90, 91, 112], i))
      }
    });
  }

  for (let i = 0; i < 34; i += 1) {
    await prisma.task.create({
      data: {
        organizationId: organization.id,
        assigneeId: pick(users, i).id,
        title: pick(["Ship onboarding checklist", "Refactor billing webhooks", "Design lead scoring", "Harden audit exports", "Tune cache policy"], i),
        project: pick(["Core Platform", "Growth", "Revenue Ops", "Security"], i),
        priority: pick(["high", "medium", "low"], i),
        status: pick(["todo", "in-progress", "done", "blocked"], i),
        dueDate: daysAgo(-14 + i)
      }
    });
  }

  for (let i = 0; i < 20; i += 1) {
    const spend = cents(pick([900, 1500, 2200, 640, 1800], i));
    await prisma.campaign.create({
      data: {
        organizationId: organization.id,
        name: pick(["Q2 Pipeline Sprint", "Founder Offer", "Lifecycle Nurture", "Integration Launch", "Partner Webinar"], i),
        channel: pick(["Search", "Social", "Email", "Partner"], i),
        spendCents: spend,
        clicks: 800 + i * 137,
        conversions: 38 + i * 6,
        revenueCents: Math.round(spend * pick([1.9, 2.7, 3.4, 1.4], i)),
        status: pick(["active", "paused", "complete"], i),
        launchedAt: daysAgo(80 - i * 3)
      }
    });
  }

  await prisma.campaign.createMany({data: [
    { organizationId: organization.id, name: "Customer referral pilot", channel: "Organic", spendCents: 0,
      revenueCents: 82500, clicks: 188, conversions: 9, status: "active", launchedAt: daysAgo(12) },
    { organizationId: organization.id, name: "Paid search experiment", channel: "Search", spendCents: 74550,
      revenueCents: 53200, clicks: 402, conversions: 5, status: "complete", launchedAt: daysAgo(20) }
  ]});

  for (let i = 0; i < 42; i += 1) {
    await prisma.systemLog.create({
      data: {
        organizationId: organization.id,
        level: pick(["info", "warn", "error", "info", "info"], i),
        service: pick(["api", "billing", "worker", "webhook"], i),
        message: pick(["Request completed", "Webhook retry scheduled", "Invoice sync delayed", "Background job completed", "Rate limit threshold reached"], i),
        latencyMs: 80 + (i % 9) * 37,
        createdAt: daysAgo(8 - i / 6)
      }
    });
  }

  for (let i = 0; i < 24; i += 1) {
    await prisma.contact.create({
      data: {
        organizationId: organization.id,
        name: pick(["Nina Patel", "Owen Brooks", "Iris Young", "Eli Foster", "Grace Kim"], i),
        company: pick(["Acme Co", "BrightPath", "Cobalt Health", "Deckhouse", "Evergreen AI"], i),
        email: `contact${i}@example.test`,
        lifecycle: pick(["Customer", "Prospect", "Champion", "Risk"], i),
        valueCents: cents(pick([12000, 4500, 7600, 18000], i)),
        lastContacted: daysAgo(i + 2)
      }
    });
  }

  for (let i = 0; i < 28; i += 1) {
    await prisma.lead.create({
      data: {
        organizationId: organization.id,
        name: pick(["Morgan West", "Lena Ortiz", "Caleb Reed", "Anika Bose", "Victor Hale"], i),
        company: pick(["Acme Co", "BrightPath", "Cobalt Health", "Deckhouse", "Evergreen AI"], i),
        source: pick(["Inbound", "Outbound", "Partner", "Event"], i),
        stage: pick(["New", "Qualified", "Demo", "Proposal", "Negotiation"], i),
        probability: pick([18, 32, 48, 66, 82], i),
        valueCents: cents(pick([9000, 14000, 22000, 36000, 51000], i)),
        createdAt: daysAgo(60 - i)
      }
    });
  }

  const insightSeeds = [
    ["Revenue", "Expand annual-plan nudges", "Annual upgrade intent is 31% higher for teams with 8+ active users.", 88, 84],
    ["Retention", "Prioritize stalled onboarding", "Accounts missing integrations after day seven show elevated churn risk.", 82, 79],
    ["Risk", "Investigate mobile checkout dip", "Mobile conversion is below baseline for two consecutive cohorts.", 74, 72],
    ["Ops", "Rebalance support staffing", "Billing tickets cluster on Tuesday mornings after invoice runs.", 68, 81],
    ["Revenue", "Increase marketplace bid caps", "Search campaigns have room to scale while keeping CAC under target.", 91, 77],
    ["Retention", "Trigger admin education", "Admin engagement predicts seat expansion in the next billing cycle.", 86, 83]
  ];

  await prisma.insight.createMany({
    data: insightSeeds.map(([category, title, summary, impactScore, confidence]) => ({
      organizationId: organization.id,
      category: category as string,
      title: title as string,
      summary: summary as string,
      impactScore: impactScore as number,
      confidence: confidence as number
    }))
  });

  console.log("Seed complete.");
  console.log("Demo login: avery@northstar.test / Password123!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
