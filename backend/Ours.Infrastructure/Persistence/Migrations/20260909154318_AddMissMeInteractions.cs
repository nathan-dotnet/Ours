using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Ours.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMissMeInteractions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MissMeInteractions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CoupleId = table.Column<Guid>(type: "uuid", nullable: false),
                    SenderUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReceiverUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    InResponseToId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MissMeInteractions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MissMeInteractions_Couples_CoupleId",
                        column: x => x.CoupleId,
                        principalTable: "Couples",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MissMeInteractions_MissMeInteractions_InResponseToId",
                        column: x => x.InResponseToId,
                        principalTable: "MissMeInteractions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MissMeInteractions_CoupleId_ReceiverUserId_CreatedAt",
                table: "MissMeInteractions",
                columns: new[] { "CoupleId", "ReceiverUserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_MissMeInteractions_CoupleId_SenderUserId_Type_CreatedAt",
                table: "MissMeInteractions",
                columns: new[] { "CoupleId", "SenderUserId", "Type", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_MissMeInteractions_InResponseToId",
                table: "MissMeInteractions",
                column: "InResponseToId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MissMeInteractions");
        }
    }
}
