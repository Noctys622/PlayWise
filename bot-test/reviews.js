const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const command = new SlashCommandBuilder().setName('panelavis')
  .setDescription('Publie un panneau pour recueillir les avis dans ce salon')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

async function handle(interaction) {
  if (interaction.isChatInputCommand() && interaction.commandName === 'panelavis') {
    if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild))
      return interaction.reply({ content: '❌ Permission Gérer le serveur requise.', ephemeral: true });
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('⭐ Avis des membres')
      .setDescription('Partagez votre expérience ! Cliquez sur le bouton ci-dessous pour laisser un avis. Les avis seront publiés dans ce salon.')
      .setFooter({ text: 'Avis de la communauté' });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('pw_avis_open')
      .setLabel('Laisser mon avis').setEmoji('⭐').setStyle(ButtonStyle.Primary));
    await interaction.deferReply({ ephemeral: true });
    try {
      await interaction.channel.send({ embeds: [embed], components: [row] });
      return interaction.editReply('✅ Panneau des avis publié.');
    } catch (error) {
      console.error('[AVIS PANEL]', error);
      if (error.code === 50013 || error.code === 50001)
        return interaction.editReply('❌ Je ne peux pas publier dans ce salon. Donne-moi les permissions Voir le salon, Envoyer des messages et Intégrer des liens.');
      return interaction.editReply('❌ Impossible de publier le panneau des avis.');
    }
  }
  if (interaction.isButton() && interaction.customId === 'pw_avis_open') {
    const modal = new ModalBuilder().setCustomId('pw_avis_submit:' + interaction.channelId).setTitle('Laisser un avis');
    const note = new TextInputBuilder().setCustomId('note').setLabel('Note de 1 à 5').setStyle(TextInputStyle.Short)
      .setPlaceholder('5').setMinLength(1).setMaxLength(1).setRequired(true);
    const commande = new TextInputBuilder().setCustomId('commande').setLabel('Produit ou service commandé').setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(150).setRequired(true);
    const avis = new TextInputBuilder().setCustomId('avis').setLabel('Votre avis').setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Racontez votre expérience...').setMinLength(3).setMaxLength(1000).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(note), new ActionRowBuilder().addComponents(commande), new ActionRowBuilder().addComponents(avis));
    return interaction.showModal(modal);
  }
  if (interaction.isModalSubmit() && interaction.customId.startsWith('pw_avis_submit:')) {
    const note = interaction.fields.getTextInputValue('note').trim();
    const avis = interaction.fields.getTextInputValue('avis').trim();
    if (!/^[1-5]$/.test(note)) return interaction.reply({ content: '❌ Indique une note de 1 à 5.', ephemeral: true });
    if (avis.length < 3) return interaction.reply({ content: '❌ Avis trop court.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const channelId = interaction.customId.split(':')[1];
    const channel = await interaction.guild?.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased() || !channel.send)
      return interaction.editReply('❌ Salon des avis introuvable.');
    const embed = new EmbedBuilder().setColor(0x5865F2)
      .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
      .setTitle('⭐'.repeat(Number(note)))
      .setDescription('« ' + avis.replace(/@/g, '@\u200b') + ' »')
      .setThumbnail(interaction.user.displayAvatarURL())
      .setFooter({ text: 'Avis membre • ' + note + '/5' }).setTimestamp();
    try {
      await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('pw_avis_open').setLabel('Laisser mon avis').setEmoji('⭐').setStyle(ButtonStyle.Primary))], allowedMentions: { parse: [] } });
      return interaction.editReply('✅ Ton avis a été publié !');
    } catch (error) {
      console.error('[AVIS]', error);
      return interaction.editReply('❌ Impossible de publier ton avis. Vérifie les permissions du bot.');
    }
  }
  return false;
}

module.exports = { command, handle };
