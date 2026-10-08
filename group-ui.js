/* Group management layer. Load after Supabase, the existing $, db, and user helpers. */
let activeGroupId = localStorage.getItem('activeGroupId') || '';
let userGroups = [];

async function loadGroups() {
  const { data, error } = await db
    .from('group_members')
    .select('group_id, role, display_name, calendar_groups(id, name)')
    .eq('user_id', user.id)
    .order('created_at');
  if (error) throw error;
  userGroups = data || [];
  if (!userGroups.length) {
    await createGroup(`${user.email.split('@')[0]}'s Work Group`);
    return loadGroups();
  }
  if (!userGroups.some(m => m.group_id === activeGroupId)) {
    activeGroupId = userGroups[0].group_id;
    localStorage.setItem('activeGroupId', activeGroupId);
  }
  renderGroups();
  await loadGroupMembers();
}

function renderGroups() {
  const select = $('groupSelect');
  if (!select) return;
  select.replaceChildren(...userGroups.map(m => new Option(m.calendar_groups.name, m.group_id)));
  select.value = activeGroupId;
  const membership = userGroups.find(m => m.group_id === activeGroupId);
  const admin = membership && ['owner', 'admin'].includes(membership.role);
  if ($('inviteCard')) $('inviteCard').hidden = !admin;
}

async function createGroup(name) {
  name = String(name || '').trim();
  if (!name) throw Error('Enter a group name.');
  const { data: group, error } = await db
    .from('calendar_groups')
    .insert({ name, created_by: user.id })
    .select()
    .single();
  if (error) throw error;
  const { error: memberError } = await db.from('group_members').insert({
    group_id: group.id, user_id: user.id, role: 'owner', display_name: user.email
  });
  if (memberError) throw memberError;
  activeGroupId = group.id;
  localStorage.setItem('activeGroupId', activeGroupId);
}

async function inviteToActiveGroup(email, role = 'member') {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) throw Error('Enter a valid email address.');
  const { error } = await db.from('group_invites').insert({
    group_id: activeGroupId, email: normalized, role, invited_by: user.id
  });
  if (error) throw error;
  message(`Invitation created for ${normalized}. Connect an email provider or Edge Function to send the invitation link.`);
}

async function loadGroupMembers() {
  const { data, error } = await db
    .from('group_members')
    .select('user_id, role, display_name')
    .eq('group_id', activeGroupId)
    .order('created_at');
  if (error) throw error;
  const list = $('groupMembers');
  if (!list) return;
  list.replaceChildren(...(data || []).map(member => {
    const row = document.createElement('div');
    row.className = 'listitem';
    row.textContent = `${member.display_name || member.user_id} · ${member.role}`;
    return row;
  }));
}

async function acceptInvite(token) {
  if (!token) throw Error('Invitation token is missing.');
  const { data, error } = await db.rpc('accept_group_invite', { invite_token: token });
  if (error) throw error;
  activeGroupId = data;
  localStorage.setItem('activeGroupId', activeGroupId);
  await loadGroups();
}

function setupGroupControls() {
  $('groupSelect')?.addEventListener('change', async event => {
    activeGroupId = event.target.value;
    localStorage.setItem('activeGroupId', activeGroupId);
    await loadGroupMembers();
    await load();
  });
  $('newGroup')?.addEventListener('click', () => run(async () => {
    const name = prompt('Name for the new group:');
    if (!name) return;
    await createGroup(name);
    await loadGroups();
    await load();
  }));
  $('inviteForm')?.addEventListener('submit', event => {
    event.preventDefault();
    run(async () => {
      await inviteToActiveGroup($('inviteEmail').value, $('inviteRole').value);
      event.target.reset();
    });
  });
}
