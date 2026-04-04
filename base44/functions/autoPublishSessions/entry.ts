import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Get all event occurrences
    const allEvents = await base44.asServiceRole.entities.EventOccurrence.filter({});

    // Find published source events (these define the recurrence pattern)
    const published = allEvents.filter(e => e.is_published && e.status === 'published');

    // Find draft events that are upcoming (next 21 days / 3 weeks)
    const threeWeeksOut = new Date(now);
    threeWeeksOut.setDate(threeWeeksOut.getDate() + 21);
    const threeWeeksStr = threeWeeksOut.toISOString().slice(0, 10);

    const drafts = allEvents.filter(e =>
      e.status === 'draft' &&
      !e.is_published &&
      e.event_date >= todayStr &&
      e.event_date <= threeWeeksStr &&
      e.series_id
    );

    if (!drafts.length) {
      console.log("No draft sessions found in the next 3 weeks to auto-publish.");
      return Response.json({ published: 0, skipped: 0 });
    }

    let publishedCount = 0;
    let skippedCount = 0;
    const results = [];

    for (const draft of drafts) {
      const mode = draft.event_mode;

      // For in-person or hybrid, venue must be confirmed before auto-publishing
      if ((mode === 'in_person' || mode === 'hybrid') && !draft.venue_confirmed) {
        console.log(`Skipping "${draft.name}" (${draft.event_date}) — venue not confirmed`);
        results.push({ name: draft.name, date: draft.event_date, action: 'skipped', reason: 'venue not confirmed' });
        skippedCount++;
        continue;
      }

      // Publish the event
      console.log(`Auto-publishing "${draft.name}" (${draft.event_date})`);
      await base44.asServiceRole.entities.EventOccurrence.update(draft.id, {
        is_published: true,
        status: 'published'
      });

      results.push({ name: draft.name, date: draft.event_date, action: 'published' });
      publishedCount++;
    }

    console.log(`Auto-publish complete: ${publishedCount} published, ${skippedCount} skipped`);
    return Response.json({ published: publishedCount, skipped: skippedCount, results });
  } catch (error) {
    console.error("autoPublishSessions error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});