const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://eeoyfrhmgarocecphcky.supabase.co';
const SUPABASE_KEY = 'sb_publishable_vzDOgmi4OqS4ippWx0nSnw_iEepaSDA';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function seedData() {
  console.log('🌱 Starting Supabase database seeding (10 vehicles per stage = 40 total)...');

  try {
    // 1. Clear existing test data
    console.log('🧹 Clearing old stage_logs, vehicle_tasks, and vehicles tables...');
    await supabase.from('stage_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('vehicle_tasks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('vehicles').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    console.log('🚘 Generating 40 Sri Lankan vehicles across 4 workshop stages...');

    const now = new Date();
    const minAgo = (m) => new Date(now.getTime() - m * 60 * 1000).toISOString();

    const stageTechMap = {
      workshop: 'Technician 1 (Workshop)',
      hoist: 'Technician 2 (Hoist)',
      alignment: 'Technician 3 (Alignment)',
      inspection: 'Service Advisor',
    };

    const vehiclesToCreate = [
      // --- 10 VEHICLES IN WORKSHOP BAY 01 ---
      { vehicle_no: 'WP CAB-7712', current_zone: 'workshop', remarks: 'Engine oil change & brake noise check.', intake_at: minAgo(45) },
      { vehicle_no: 'WP CAD-4489', current_zone: 'workshop', remarks: 'Check engine light code P0300 spark plug replacement.', intake_at: minAgo(25) },
      { vehicle_no: 'WP CBA-1020', current_zone: 'workshop', remarks: 'Standard 10,000km maintenance service.', intake_at: minAgo(15) },
      { vehicle_no: 'WP CBE-3040', current_zone: 'workshop', remarks: 'Battery testing & alternator output check.', intake_at: minAgo(35) },
      { vehicle_no: 'CP CAC-5060', current_zone: 'workshop', remarks: 'Coolant refill & radiator pressure test.', intake_at: minAgo(50) },
      { vehicle_no: 'EP CBB-7080', current_zone: 'workshop', remarks: 'Air filter & cabin pollen filter replacement.', intake_at: minAgo(10) },
      { vehicle_no: 'SP GAD-9011', current_zone: 'workshop', remarks: 'Serpentine belt inspection & tension adjustment.', intake_at: minAgo(40) },
      { vehicle_no: 'NP CAA-2233', current_zone: 'workshop', remarks: 'Wiper blade replacement & washer fluid top-up.', intake_at: minAgo(20) },
      { vehicle_no: 'NW CBD-4455', current_zone: 'workshop', remarks: 'Hybrid high-voltage battery cooling fan cleaning.', intake_at: minAgo(5) },
      { vehicle_no: 'SG CCE-6677', current_zone: 'workshop', remarks: 'Brake fluid flushing & moisture test.', intake_at: minAgo(30) },

      // --- 10 VEHICLES IN HOIST SERVICE BAY 02 ---
      { vehicle_no: 'WP KAZ-4509', current_zone: 'hoist', remarks: 'Underbody rust check & transmission fluid flush.', intake_at: minAgo(90) },
      { vehicle_no: 'SP GAD-9012', current_zone: 'hoist', remarks: 'Brake pad replacement front & rear disc resurfacing.', intake_at: minAgo(60) },
      { vehicle_no: 'WP CAF-1122', current_zone: 'hoist', remarks: 'Exhaust muffler pipe leak welding & gasket swap.', intake_at: minAgo(75) },
      { vehicle_no: 'WP CBG-3344', current_zone: 'hoist', remarks: 'Lower control arm bush replacement.', intake_at: minAgo(85) },
      { vehicle_no: 'CP CAH-5566', current_zone: 'hoist', remarks: 'Differential oil change 4WD system check.', intake_at: minAgo(65) },
      { vehicle_no: 'WP CAJ-7788', current_zone: 'hoist', remarks: 'Drive shaft boot replacement & grease packing.', intake_at: minAgo(95) },
      { vehicle_no: 'NW CAK-9900', current_zone: 'hoist', remarks: 'Shock absorber leak inspection & coil spring check.', intake_at: minAgo(70) },
      { vehicle_no: 'WP CAL-1234', current_zone: 'hoist', remarks: 'Engine mount rubber damper replacement.', intake_at: minAgo(80) },
      { vehicle_no: 'SP CAM-5678', current_zone: 'hoist', remarks: 'Fuel tank guard plate mounting.', intake_at: minAgo(55) },
      { vehicle_no: 'WP CAN-9012', current_zone: 'hoist', remarks: 'Power steering rack leak fix.', intake_at: minAgo(100) },

      // --- 10 VEHICLES IN WHEEL ALIGNMENT BAY 03 ---
      { vehicle_no: 'WP CAR-1188', current_zone: 'alignment', remarks: 'Steering pulling left at 80km/h after tire swap.', intake_at: minAgo(120) },
      { vehicle_no: 'WP CAO-2468', current_zone: 'alignment', remarks: 'Four wheel 3D laser alignment & camber correction.', intake_at: minAgo(110) },
      { vehicle_no: 'CP CAP-1357', current_zone: 'alignment', remarks: 'Dynamic high-speed wheel balancing for 4 tires.', intake_at: minAgo(130) },
      { vehicle_no: 'WP CAQ-9876', current_zone: 'alignment', remarks: 'Steering wheel centering after tie rod end replacement.', intake_at: minAgo(105) },
      { vehicle_no: 'EP CAS-5432', current_zone: 'alignment', remarks: 'Uneven tire tread wear inspection & toe adjustment.', intake_at: minAgo(125) },
      { vehicle_no: 'WP CAT-1029', current_zone: 'alignment', remarks: 'Alloy wheel rim runout check & tire rotation.', intake_at: minAgo(115) },
      { vehicle_no: 'NW CAU-3847', current_zone: 'alignment', remarks: 'Steering angle sensor calibration (SAS).', intake_at: minAgo(140) },
      { vehicle_no: 'WP CAV-5612', current_zone: 'alignment', remarks: 'Rear axle alignment & caster measurement.', intake_at: minAgo(100) },
      { vehicle_no: 'SP CAW-7834', current_zone: 'alignment', remarks: 'New Bridgestone tires installation & calibration.', intake_at: minAgo(135) },
      { vehicle_no: 'WP CAX-9056', current_zone: 'alignment', remarks: 'Vibration audit at 100km/h highway test.', intake_at: minAgo(150) },

      // --- 10 VEHICLES IN ADVISOR INSPECTION ZONE ---
      { vehicle_no: 'CP BAF-3321', current_zone: 'inspection', remarks: 'Full 20,000km major service completed. Ready for handover.', intake_at: minAgo(180) },
      { vehicle_no: 'WP CAY-1111', current_zone: 'inspection', remarks: 'Final quality inspection & road testing complete.', intake_at: minAgo(165) },
      { vehicle_no: 'WP CAZ-2222', current_zone: 'inspection', remarks: 'Exterior body wash & interior vacuum completed.', intake_at: minAgo(195) },
      { vehicle_no: 'SP CBA-3333', current_zone: 'inspection', remarks: 'Engine bay detailing & battery terminal grease.', intake_at: minAgo(175) },
      { vehicle_no: 'WP CBB-4444', current_zone: 'inspection', remarks: 'Invoice generated & keys handed to reception.', intake_at: minAgo(210) },
      { vehicle_no: 'CP CBC-5555', current_zone: 'inspection', remarks: 'Periodic maintenance inspection sheet signed by lead tech.', intake_at: minAgo(185) },
      { vehicle_no: 'NW CBD-6666', current_zone: 'inspection', remarks: 'Spare wheel pressure verified & tool kit checked.', intake_at: minAgo(200) },
      { vehicle_no: 'WP CBE-7777', current_zone: 'inspection', remarks: 'Headlight alignment verified & wiper test clean.', intake_at: minAgo(160) },
      { vehicle_no: 'EP CBF-8888', current_zone: 'inspection', remarks: 'A/C cabin temperature audit (passed at 4.2°C).', intake_at: minAgo(220) },
      { vehicle_no: 'WP CBG-9999', current_zone: 'inspection', remarks: 'Customer notified via SMS for vehicle retrieval.', intake_at: minAgo(240) },
    ];

    for (const vData of vehiclesToCreate) {
      const assignedTech = stageTechMap[vData.current_zone] || 'Technician 1 (Workshop)';
      
      const { data: v, error: vErr } = await supabase
        .from('vehicles')
        .insert({
          vehicle_no: vData.vehicle_no,
          current_zone: vData.current_zone,
          assigned_tech: assignedTech,
          remarks: vData.remarks,
          intake_at: vData.intake_at,
          is_finished: false,
        })
        .select()
        .single();

      if (vErr) {
        console.error(`❌ Error inserting vehicle ${vData.vehicle_no}:`, vErr.message);
        continue;
      }

      console.log(`✅ Seeded: ${v.vehicle_no} in [${v.current_zone.toUpperCase()}]`);

      // Determine task completion according to stage
      const isGeneralDone = ['hoist', 'alignment', 'inspection'].includes(v.current_zone);
      const isHoistDone = ['alignment', 'inspection'].includes(v.current_zone);
      const isAlignDone = v.current_zone === 'inspection';

      const tasks = [
        {
          vehicle_id: v.id,
          task_name: 'General Service',
          task_type: 'general_service',
          is_required: true,
          is_completed: isGeneralDone,
          completed_at: isGeneralDone ? minAgo(30) : null,
          completed_by: isGeneralDone ? 'Technician 1 (Workshop)' : null,
        },
        {
          vehicle_id: v.id,
          task_name: 'Hoist Service',
          task_type: 'hoist_service',
          is_required: true,
          is_completed: isHoistDone,
          completed_at: isHoistDone ? minAgo(15) : null,
          completed_by: isHoistDone ? 'Technician 2 (Hoist)' : null,
        },
        {
          vehicle_id: v.id,
          task_name: 'Wheel Alignment',
          task_type: 'wheel_alignment',
          is_required: true,
          is_completed: isAlignDone,
          completed_at: isAlignDone ? minAgo(5) : null,
          completed_by: isAlignDone ? 'Technician 3 (Alignment)' : null,
        },
      ];

      const { error: tErr } = await supabase.from('vehicle_tasks').insert(tasks);
      if (tErr) console.error('Task insert error:', tErr.message);

      // Generate realistic stage transition history
      const intakeTime = new Date(vData.intake_at).getTime();
      
      if (vData.current_zone === 'workshop') {
        await supabase.from('stage_logs').insert({
          vehicle_id: v.id,
          from_zone: null,
          to_zone: 'workshop',
          entered_at: vData.intake_at,
          moved_by: 'Job Supervisor',
        });
      } else if (vData.current_zone === 'hoist') {
        const workshopEntered = new Date(intakeTime).toISOString();
        const hoistEntered = new Date(intakeTime + 25 * 60 * 1000).toISOString();
        await supabase.from('stage_logs').insert([
          { vehicle_id: v.id, from_zone: null, to_zone: 'workshop', entered_at: workshopEntered, exited_at: hoistEntered, moved_by: 'Job Supervisor' },
          { vehicle_id: v.id, from_zone: 'workshop', to_zone: 'hoist', entered_at: hoistEntered, moved_by: 'Technician 1 (Workshop)' },
        ]);
      } else if (vData.current_zone === 'alignment') {
        const workshopEntered = new Date(intakeTime).toISOString();
        const hoistEntered = new Date(intakeTime + 30 * 60 * 1000).toISOString();
        const alignEntered = new Date(intakeTime + 60 * 60 * 1000).toISOString();
        await supabase.from('stage_logs').insert([
          { vehicle_id: v.id, from_zone: null, to_zone: 'workshop', entered_at: workshopEntered, exited_at: hoistEntered, moved_by: 'Job Supervisor' },
          { vehicle_id: v.id, from_zone: 'workshop', to_zone: 'hoist', entered_at: hoistEntered, exited_at: alignEntered, moved_by: 'Technician 1 (Workshop)' },
          { vehicle_id: v.id, from_zone: 'hoist', to_zone: 'alignment', entered_at: alignEntered, moved_by: 'Technician 2 (Hoist)' },
        ]);
      } else if (vData.current_zone === 'inspection') {
        const workshopEntered = new Date(intakeTime).toISOString();
        const hoistEntered = new Date(intakeTime + 30 * 60 * 1000).toISOString();
        const alignEntered = new Date(intakeTime + 70 * 60 * 1000).toISOString();
        const inspectEntered = new Date(intakeTime + 110 * 60 * 1000).toISOString();
        await supabase.from('stage_logs').insert([
          { vehicle_id: v.id, from_zone: null, to_zone: 'workshop', entered_at: workshopEntered, exited_at: hoistEntered, moved_by: 'Job Supervisor' },
          { vehicle_id: v.id, from_zone: 'workshop', to_zone: 'hoist', entered_at: hoistEntered, exited_at: alignEntered, moved_by: 'Technician 1 (Workshop)' },
          { vehicle_id: v.id, from_zone: 'hoist', to_zone: 'alignment', entered_at: alignEntered, exited_at: inspectEntered, moved_by: 'Technician 2 (Hoist)' },
          { vehicle_id: v.id, from_zone: 'alignment', to_zone: 'inspection', entered_at: inspectEntered, moved_by: 'Technician 3 (Alignment)' },
        ]);
      }
    }

    console.log('🎉 Database Seeding Complete! 40 Vehicles (10 per stage) successfully created.');
  } catch (err) {
    console.error('Fatal seed error:', err);
  }
}

seedData();
